#!/usr/bin/env bash
# ==============================================================================
# scripts/run_pipeline.sh
# End-to-End Simulation, MySQL Ingestion & Benchmarking Pipeline
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# Configuration & Environment
# ------------------------------------------------------------------------------
TARGET_SCENARIO="${1:-all}"
MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PWD="${MYSQL_PASSWORD:-}"
MYSQL_DB="${MYSQL_DATABASE:-memory_mirage_db}"

DATA_DIR="data"
LOG_DIR="logs"
PIPELINE_LOG="${LOG_DIR}/pipeline_$(date +%Y%m%d_%H%M%S).log"

mkdir -p "${LOG_DIR}"

# ------------------------------------------------------------------------------
# Helper Shell Functions
# ------------------------------------------------------------------------------
log() {
    local level="$1"
    shift
    local timestamp
    timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    echo "[${timestamp}] [${level}] $*" | tee -a "${PIPELINE_LOG}"
}

check_prerequisites() {
    log "INFO" "Checking pipeline prerequisites..."
    command -v python >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1 || {
        log "ERROR" "Python 3 is required but not installed." >&2
        exit 1
    }
    command -v mysql >/dev/null 2>&1 || {
        log "ERROR" "MySQL client CLI is required but not installed." >&2
        exit 1
    }
}

run_simulation() {
    local scenario="$1"
    log "INFO" "Executing simulation workload for scenario target: ${scenario}..."
    
    local python_bin="python"
    command -v python3 >/dev/null 2>&1 && python_bin="python3"

    ${python_bin} experiments/run_all_scenarios.py --scenario "${scenario}" >> "${PIPELINE_LOG}" 2>&1 || {
        log "ERROR" "Simulation run failed. Check ${PIPELINE_LOG} for tracebacks." >&2
        exit 1
    }
    log "INFO" "Simulation completed successfully. CSV datasets populated."
}

load_csv_to_mysql() {
    local file_path="$1"
    local scenario_tag="$2"
    local strategy_tag="$3"

    if [[ ! -f "${file_path}" ]]; then
        log "WARN" "File ${file_path} not found. Skipping MySQL ingestion."
        return 0
    fi

    log "INFO" "Ingesting ${file_path} into MySQL 8.4 database [${MYSQL_DB}]..."

    # Create run entry and retrieve generated run_id
    local insert_run_sql="
        INSERT INTO simulation_runs (
            scenario_id, mitigation_strategy, page_replacement_policy,
            db_cache_size_pages, os_cache_size_pages, total_steps, workload_config
        ) VALUES (
            '${scenario_tag}', '${strategy_tag}', 'LRU', 50, 50, 1000,
            JSON_OBJECT('source_file', '${file_path}', 'ingested_via', 'run_pipeline.sh')
        );
        SELECT LAST_INSERT_ID();
    "

    local run_id
    run_id=$(mysql -h "${MYSQL_HOST}" -P "${MYSQL_PORT}" -u "${MYSQL_USER}" \
        ${MYSQL_PWD:+-p"${MYSQL_PWD}"} -D "${MYSQL_DB}" -s -N -e "${insert_run_sql}" 2>> "${PIPELINE_LOG}")

    if [[ -z "${run_id}" || "${run_id}" -eq 0 ]]; then
        log "ERROR" "Failed to register simulation run in MySQL." >&2
        return 1
    fi

    log "INFO" "Registered simulation run with run_id: ${run_id}"

    # Parse CSV via awk and bulk insert step metrics (skipping header row)
    awk -F',' -v r_id="${run_id}" '
        NR > 1 && NF >= 10 {
            # Normalize column inputs
            step = $1;
            page = $2;
            op = ($3 ~ /WRITE/ ? "WRITE" : "READ");
            hit = $4;
            lat = $5;
            db_ratio = $6;
            os_ratio = $7;
            dup_rate = $8;
            reads = $9;
            thrash = ($10 ~ /1|True|true/ ? 1 : 0);

            printf "INSERT INTO step_metrics (run_id, step_no, page_id, operation, hit_type, latency_ms, db_cache_hit_ratio, os_cache_hit_ratio, duplication_rate, cumulative_disk_reads, is_thrashing_step) VALUES (%d, %d, %d, \x27%s\x27, \x27%s\x27, %.4f, %.4f, %.4f, %.4f, %d, %d);\n",
                r_id, step, page, op, hit, lat, db_ratio, os_ratio, dup_rate, reads, thrash;
        }
    ' "${file_path}" | mysql -h "${MYSQL_HOST}" -P "${MYSQL_PORT}" -u "${MYSQL_USER}" \
        ${MYSQL_PWD:+-p"${MYSQL_PWD}"} -D "${MYSQL_DB}" >> "${PIPELINE_LOG}" 2>&1

    log "INFO" "Completed telemetry ingestion for run_id: ${run_id}"
}

ingest_all_data() {
    local target="$1"
    local scenarios=()

    if [[ "${target}" == "all" ]]; then
        scenarios=("scenario1" "scenario2" "scenario3")
    else
        scenarios=("${target}")
    fi

    for sc in "${scenarios[@]}"; do
        for strat in "double_caching" "coordinated"; do
            local file="${DATA_DIR}/${sc}_${strat}.csv"
            local sql_strat="DOUBLE_CACHING"
            [[ "${strat}" == "coordinated" ]] && sql_strat="COORDINATED"

            if [[ -f "${file}" ]]; then
                load_csv_to_mysql "${file}" "${sc}" "${sql_strat}"
            fi
        done
    done
}

generate_terminal_report() {
    log "INFO" "Querying dynamic view v_mitigation_summary for final report..."

    local report_sql="
        SELECT 
            scenario_id,
            mitigation_strategy,
            total_runs_recorded,
            avg_latency_ms,
            avg_duplication_pct,
            avg_db_hit_pct,
            avg_os_hit_pct,
            total_disk_reads,
            total_thrashing_events
        FROM v_mitigation_summary
        ORDER BY scenario_id, mitigation_strategy;
    "

    local raw_output
    raw_output=$(mysql -h "${MYSQL_HOST}" -P "${MYSQL_PORT}" -u "${MYSQL_USER}" \
        ${MYSQL_PWD:+-p"${MYSQL_PWD}"} -D "${MYSQL_DB}" -t -e "${report_sql}" 2>> "${PIPELINE_LOG}")

    echo ""
    echo "=========================================================================================="
    echo "                     MEMORY MIRAGE: SIMULATION & MITIGATION REPORT                        "
    echo "=========================================================================================="
    echo "${raw_output}"
    echo "=========================================================================================="
    echo ""

    # Grep and Awk filter: Thrashing and duplication warning check
    echo "${raw_output}" | grep -E "DOUBLE_CACHING|COORDINATED" | awk '
        {
            scenario = $2;
            strat = $4;
            dup = $10;
            thrash = $18;
            if (dup > 25.0) {
                printf " [ALERT] %s (%s): Elevated duplication rate detected at %s%%\n", scenario, strat, dup;
            }
            if (thrash > 0) {
                printf " [ALERT] %s (%s): %s Thrashing events recorded!\n", scenario, strat, thrash;
            }
        }
    '
    echo ""
}

# ------------------------------------------------------------------------------
# Main Flow
# ------------------------------------------------------------------------------
main() {
    log "INFO" "Starting pipeline execution (Target: ${TARGET_SCENARIO})"
    check_prerequisites
    run_simulation "${TARGET_SCENARIO}"
    ingest_all_data "${TARGET_SCENARIO}"
    generate_terminal_report
    log "INFO" "Pipeline finished successfully."
}

main "$@"