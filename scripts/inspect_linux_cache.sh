#!/usr/bin/env bash
# ==============================================================================
# scripts/inspect_linux_cache.sh
# Real-Time Linux Page Cache & Virtual Memory Telemetry Inspector
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# Safety & Platform Checks
# ------------------------------------------------------------------------------
if [[ ! -r "/proc/meminfo" || ! -r "/proc/vmstat" ]]; then
    echo "Error: /proc/meminfo or /proc/vmstat not accessible. This script requires a Linux kernel environment." >&2
    exit 1
fi

# ------------------------------------------------------------------------------
# Extract Metrics from /proc/meminfo via grep and awk
# ------------------------------------------------------------------------------
MEM_TOTAL_KB=$(grep -m1 '^MemTotal:' /proc/meminfo | awk '{print $2}')
MEM_FREE_KB=$(grep -m1 '^MemFree:' /proc/meminfo | awk '{print $2}')
MEM_AVAIL_KB=$(grep -m1 '^MemAvailable:' /proc/meminfo | awk '{print $2}')
BUFFERS_KB=$(grep -m1 '^Buffers:' /proc/meminfo | awk '{print $2}')
CACHED_KB=$(grep -m1 '^Cached:' /proc/meminfo | awk '{print $2}')
DIRTY_KB=$(grep -m1 '^Dirty:' /proc/meminfo | awk '{print $2}')
WRITEBACK_KB=$(grep -m1 '^Writeback:' /proc/meminfo | awk '{print $2}')
ACTIVE_FILE_KB=$(grep -m1 '^Active(file):' /proc/meminfo | awk '{print $2}')
INACTIVE_FILE_KB=$(grep -m1 '^Inactive(file):' /proc/meminfo | awk '{print $2}')
MAPPED_KB=$(grep -m1 '^Mapped:' /proc/meminfo | awk '{print $2}')

# ------------------------------------------------------------------------------
# Extract Metrics from /proc/vmstat via grep and awk
# ------------------------------------------------------------------------------
PG_PGFREE=$(grep -m1 '^pgfree ' /proc/vmstat | awk '{print $2}')
PG_PGACTIVATE=$(grep -m1 '^pgactivate ' /proc/vmstat | awk '{print $2}')
PG_PGDEACTIVATE=$(grep -m1 '^pgdeactivate ' /proc/vmstat | awk '{print $2}')
PG_PGFAUL=$(grep -m1 '^pgfault ' /proc/vmstat | awk '{print $2}')
PG_PGMAJFAUL=$(grep -m1 '^pgmajfault ' /proc/vmstat | awk '{print $2}')

# ------------------------------------------------------------------------------
# Convert and Compute Derived Telemetry (MB & Percentages)
# ------------------------------------------------------------------------------
kb_to_mb() {
    awk -v kb="$1" 'BEGIN { printf "%.2f", kb / 1024 }'
}

calc_pct() {
    awk -v part="$1" -v total="$2" 'BEGIN { if (total > 0) printf "%.2f", (part / total) * 100; else printf "0.00" }'
}

MEM_TOTAL_MB=$(kb_to_mb "${MEM_TOTAL_KB}")
MEM_FREE_MB=$(kb_to_mb "${MEM_FREE_KB}")
MEM_AVAIL_MB=$(kb_to_mb "${MEM_AVAIL_KB}")
BUFFERS_MB=$(kb_to_mb "${BUFFERS_KB}")
CACHED_MB=$(kb_to_mb "${CACHED_KB}")
DIRTY_MB=$(kb_to_mb "${DIRTY_KB}")
WRITEBACK_MB=$(kb_to_mb "${WRITEBACK_KB}")
ACTIVE_FILE_MB=$(kb_to_mb "${ACTIVE_FILE_KB}")
INACTIVE_FILE_MB=$(kb_to_mb "${INACTIVE_FILE_KB}")

PAGE_CACHE_PCT=$(calc_pct "${CACHED_KB}" "${MEM_TOTAL_KB}")
DIRTY_PCT=$(calc_pct "${DIRTY_KB}" "${CACHED_KB}")

# ------------------------------------------------------------------------------
# Formatted Terminal Output
# ------------------------------------------------------------------------------
echo "=============================================================================="
echo "                  LINUX KERNEL PAGE CACHE & VM INSPECTOR                      "
echo "=============================================================================="
echo " Host: $(uname -n) | Kernel: $(uname -r) | Sample Time: $(date +'%T')"
echo "------------------------------------------------------------------------------"
printf " %-30s : %10s MB\n" "Total System Memory" "${MEM_TOTAL_MB}"
printf " %-30s : %10s MB\n" "Free Memory" "${MEM_FREE_MB}"
printf " %-30s : %10s MB\n" "Available Memory" "${MEM_AVAIL_MB}"
echo "------------------------------------------------------------------------------"
echo "--- OS Page Cache & Buffer Subsystem ---"
printf " %-30s : %10s MB  (%s%% of total RAM)\n" "OS Page Cache (Cached)" "${CACHED_MB}" "${PAGE_CACHE_PCT}"
printf " %-30s : %10s MB\n" "Block Buffers (Buffers)" "${BUFFERS_MB}"
printf " %-30s : %10s MB  (%s%% of Page Cache)\n" "Dirty Pages (Pending Disk Sync)" "${DIRTY_MB}" "${DIRTY_PCT}"
printf " %-30s : %10s MB\n" "Writeback Pages (Active IO)" "${WRITEBACK_MB}"
printf " %-30s : %10s MB\n" "Active File Pages" "${ACTIVE_FILE_MB}"
printf " %-30s : %10s MB\n" "Inactive File Pages (LRU Victim Pool)" "${INACTIVE_FILE_MB}"
echo "------------------------------------------------------------------------------"
echo "--- Virtual Memory Paging & Faults (/proc/vmstat) ---"
printf " %-30s : %12s events\n" "Minor Page Faults (pgfault)" "${PG_PGFAUL}"
printf " %-30s : %12s events (I/O Bottlenecks)\n" "Major Page Faults (pgmajfault)" "${PG_PGMAJFAUL}"
printf " %-30s : %12s pages\n" "Page Free Counter (pgfree)" "${PG_PGFREE}"
printf " %-30s : %12s pages\n" "Page Activations (pgactivate)" "${PG_PGACTIVATE}"
printf " %-30s : %12s pages\n" "Page Deactivations (pgdeactivate)" "${PG_PGDEACTIVATE}"
echo "=============================================================================="

# Kernel double-buffering note
awk -v dirty_kb="${DIRTY_KB}" -v cached_kb="${CACHED_KB}" 'BEGIN {
    if (cached_kb > 0 && dirty_kb > 102400) {
        print "\n[NOTE] Substantial dirty page accumulation detected (>100MB).";
        print "       OS flush daemon (flusher/pdflush) writeback may contend with DBMS syncs.\n";
    }
}'