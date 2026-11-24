import csv
import json
import os
import time
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.sql.db import get_db_connection
from simulator.cache import ReplacementPolicy
from simulator.full_simulator import MemoryHierarchySimulator
from simulator.os_cache import CoordinationMode
from simulator.workload import generate_workload

app = FastAPI(
    title="Memory Mirage API",
    description="API for the OS-DBMS double-caching simulator and MySQL 8.4 benchmarks",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "message": "Memory Mirage backend is running",
    }


class SimulationRequest(BaseModel):
    scenario_name: str = Field(default="scenario1", description="Target scenario identifier")
    db_cache_size: int = Field(default=50, ge=1, description="DBMS buffer pool capacity in pages")
    os_cache_size: int = Field(default=50, ge=1, description="OS page cache capacity in pages")
    coordination_mode: str = Field(default="DOUBLE_CACHING", description="DOUBLE_CACHING, O_DIRECT, or COORDINATED")
    replacement_policy: str = Field(default="LRU", description="LRU, LFU, FIFO, OPTIMAL, or CLOCK")
    num_steps: int = Field(default=1000, ge=10, le=100000, description="Total simulation steps")
    write_ratio: float = Field(default=0.2, ge=0.0, le=1.0, description="Write request probability")


@app.post("/api/simulate")
def run_simulation_endpoint(payload: SimulationRequest) -> Dict[str, Any]:
    try:
        coord_mode = CoordinationMode[payload.coordination_mode.upper()]
    except KeyError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid coordination_mode. Must be one of {[m.name for m in CoordinationMode]}",
        )

    try:
        repl_policy = ReplacementPolicy[payload.replacement_policy.upper()]
    except KeyError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid replacement_policy. Must be one of {[p.name for p in ReplacementPolicy]}",
        )

    workload = generate_workload(
        scenario_name=payload.scenario_name,
        num_steps=payload.num_steps,
    )

    sim = MemoryHierarchySimulator(
        db_cache_size=payload.db_cache_size,
        os_cache_size=payload.os_cache_size,
        policy=repl_policy,
        mode=coord_mode,
    )

    telemetry = sim.run_workload(
        workload=workload,
        write_probability=payload.write_ratio,
    )

    steps_data = [
        {
            "step_no": t.step_no,
            "page_id": t.page_id,
            "operation": t.operation,
            "hit_type": t.hit_type,
            "latency_ms": t.latency_ms,
            "db_cache_hit_ratio": t.db_cache_hit_ratio,
            "os_cache_hit_ratio": t.os_cache_hit_ratio,
            "duplication_rate": t.duplication_rate,
            "cumulative_disk_reads": t.cumulative_disk_reads,
            "is_thrashing_step": t.is_thrashing_step,
        }
        for t in telemetry
    ]

    total_steps = len(telemetry)
    avg_latency = sum(t.latency_ms for t in telemetry) / total_steps if total_steps > 0 else 0.0
    avg_duplication = sum(t.duplication_rate for t in telemetry) / total_steps if total_steps > 0 else 0.0
    total_thrashing = sum(1 for t in telemetry if t.is_thrashing_step)

    # Persist live simulation run & telemetry rows into MySQL 8.4
    persisted_run_id = None
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                # 1. Ensure parent scenario exists for Foreign Key integrity
                cursor.execute("SHOW COLUMNS FROM scenarios")
                scen_cols = cursor.fetchall()
                cols_to_insert = []
                vals_to_insert = []
                for col in scen_cols:
                    field, col_type, is_null, default_val, extra = col[0], col[1].lower(), col[2], col[4], col[5].lower()
                    if "auto_increment" in extra:
                        continue
                    if field == "scenario_id":
                        cols_to_insert.append(field)
                        vals_to_insert.append(payload.scenario_name)
                    elif is_null == "NO" and default_val is None:
                        cols_to_insert.append(field)
                        if any(t in col_type for t in ("int", "decimal", "float", "double")):
                            vals_to_insert.append(0)
                        else:
                            vals_to_insert.append(f"Live Workload ({payload.scenario_name})")

                placeholders = ", ".join(["%s"] * len(cols_to_insert))
                col_list = ", ".join(cols_to_insert)
                cursor.execute(
                    f"INSERT IGNORE INTO scenarios ({col_list}) VALUES ({placeholders})",
                    tuple(vals_to_insert),
                )

                # 2. Insert parent run record into simulation_runs
                cursor.execute(
                    """
                    INSERT INTO simulation_runs (
                        scenario_id,
                        mitigation_strategy,
                        page_replacement_policy,
                        db_cache_size_pages,
                        os_cache_size_pages,
                        total_steps,
                        workload_config
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        payload.scenario_name,
                        coord_mode.name,
                        repl_policy.name,
                        payload.db_cache_size,
                        payload.os_cache_size,
                        total_steps,
                        json.dumps({"source": "live_ui", "write_ratio": payload.write_ratio}),
                    ),
                )
                persisted_run_id = cursor.lastrowid

                # 3. Bulk-insert per-step telemetry into step_metrics (fires AFTER INSERT trigger)
                metric_rows = [
                    (
                        persisted_run_id,
                        t.step_no,
                        t.page_id,
                        t.operation,
                        t.hit_type,
                        t.latency_ms,
                        t.db_cache_hit_ratio,
                        t.os_cache_hit_ratio,
                        t.duplication_rate,
                        t.cumulative_disk_reads,
                        1 if t.is_thrashing_step else 0,
                    )
                    for t in telemetry
                ]
                cursor.executemany(
                    """
                    INSERT INTO step_metrics (
                        run_id,
                        step_no,
                        page_id,
                        operation,
                        hit_type,
                        latency_ms,
                        db_cache_hit_ratio,
                        os_cache_hit_ratio,
                        duplication_rate,
                        cumulative_disk_reads,
                        is_thrashing_step
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    metric_rows,
                )
            conn.commit()
    except Exception as db_exc:
        print(f"[WARN] MySQL persistence skipped for run: {db_exc}")

    return {
        "status": "success",
        "run_id": persisted_run_id,
        "config": payload.model_dump(),
        "summary": {
            "total_steps": total_steps,
            "db_hits": sim.db_hits,
            "os_hits": sim.os_hits,
            "disk_hits": sim.disk_hits,
            "cumulative_disk_reads": sim.cumulative_disk_reads,
            "avg_latency_ms": round(avg_latency, 4),
            "avg_duplication_rate": round(avg_duplication, 4),
            "total_thrashing_events": total_thrashing,
        },
        "telemetry": steps_data,
    }


@app.get("/api/benchmark/file-vs-dbms")
def benchmark_file_vs_dbms() -> Dict[str, Any]:
    csv_file_path = os.path.join("data", "scenario1_results.csv")
    if not os.path.isfile(csv_file_path):
        raise HTTPException(
            status_code=404,
            detail=f"Benchmark dataset '{csv_file_path}' not found on file system.",
        )

    start_csv = time.perf_counter()
    csv_row_count = 0
    total_latency_csv = 0.0
    total_duplication_csv = 0.0
    max_disk_reads_csv = 0

    with open(csv_file_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            csv_row_count += 1
            total_latency_csv += float(row.get("latency_ms", 0.0))
            total_duplication_csv += float(row.get("duplication_rate", 0.0))
            reads = int(row.get("cumulative_disk_reads", 0))
            if reads > max_disk_reads_csv:
                max_disk_reads_csv = reads

    end_csv = time.perf_counter()
    csv_time_ms = round((end_csv - start_csv) * 1000, 3)

    csv_avg_latency = round(total_latency_csv / csv_row_count, 4) if csv_row_count > 0 else 0.0
    csv_avg_duplication = round(total_duplication_csv / csv_row_count, 4) if csv_row_count > 0 else 0.0

    start_dbms = time.perf_counter()
    dbms_result = {}

    try:
        with get_db_connection() as conn:
            with conn.cursor(dictionary=True) as cursor:
                cursor.execute(
                    """
                    SELECT 
                        COUNT(*) AS row_count,
                        ROUND(AVG(m.latency_ms), 4) AS avg_latency_ms,
                        ROUND(AVG(m.duplication_rate), 4) AS avg_duplication_rate,
                        MAX(m.cumulative_disk_reads) AS max_disk_reads
                    FROM step_metrics m
                    JOIN simulation_runs r ON m.run_id = r.run_id
                    WHERE r.scenario_id = 'scenario1'
                    """
                )
                dbms_result = cursor.fetchone() or {}
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Database aggregation failed: {str(exc)}",
        )

    end_dbms = time.perf_counter()
    dbms_time_ms = round((end_dbms - start_dbms) * 1000, 3)

    speedup = round(csv_time_ms / dbms_time_ms, 2) if dbms_time_ms > 0 else 0.0

    return {
        "status": "success",
        "benchmark": {
            "csv_time_ms": csv_time_ms,
            "dbms_time_ms": dbms_time_ms,
            "speedup_factor": f"{speedup}x",
            "faster_engine": "DBMS (MySQL 8.4)" if dbms_time_ms < csv_time_ms else "File System (CSV)",
        },
        "csv_metrics": {
            "rows_scanned": csv_row_count,
            "avg_latency_ms": csv_avg_latency,
            "avg_duplication_rate": csv_avg_duplication,
            "max_disk_reads": max_disk_reads_csv,
        },
        "dbms_metrics": {
            "rows_scanned": dbms_result.get("row_count", 0),
            "avg_latency_ms": float(dbms_result.get("avg_latency_ms") or 0.0),
            "avg_duplication_rate": float(dbms_result.get("avg_duplication_rate") or 0.0),
            "max_disk_reads": dbms_result.get("max_disk_reads", 0),
        },
    }