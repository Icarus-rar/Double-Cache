"""Run identical workloads with and without cache coordination."""

import csv
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from simulator.full_simulator import FullSimulator
from simulator.workload import Workload

DATA_DIR = os.path.join(PROJECT_ROOT, "data")


def run_pair(name, workload, db_cache_size, os_cache_size, total_blocks):
    print("\n" + "=" * 70)
    print(f"MITIGATION COMPARISON: {name}")
    print("=" * 70)

    results = {}
    for mode, label in [
        ("double_caching", "Baseline: Double Caching"),
        ("coordinated", "Solution: Coordinated Caching"),
    ]:
        print(f"\n--- {label} ---")
        sim = FullSimulator(
            db_cache_size=db_cache_size,
            os_cache_size=os_cache_size,
            total_blocks=total_blocks,
            cache_mode=mode,
        )
        sim.process_workload(workload)
        output = os.path.join(DATA_DIR, f"{name}_{mode}.csv")
        sim.save_results(output)
        results[mode] = sim

    return results


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    experiments = [
        (
            "scenario1",
            Workload.sequential(num_blocks=10, start_block=0),
            5,
            5,
            100,
        ),
        (
            "scenario2",
            None,
            10,
            10,
            100,
        ),
        (
            "scenario3",
            None,
            3,
            3,
            100,
        ),
    ]

    # Generate random/hotspot workloads once so both strategies see
    # exactly the same accesses.
    experiments[1] = (experiments[1][0], Workload.hotspot(30, 20, 100), 10, 10, 100)
    experiments[2] = (experiments[2][0], Workload.random(50, 100), 3, 3, 100)

    summary_rows = []
    for name, workload, db_size, os_size, total_blocks in experiments:
        sims = run_pair(name, workload, db_size, os_size, total_blocks)
        for mode, sim in sims.items():
            summary = sim.get_summary()
            summary_rows.append({
                "scenario": name,
                "strategy": mode,
                "total_steps": summary["total_steps"],
                "db_hits": summary["db_hits"],
                "os_hits": summary["os_hits"],
                "disk_reads": summary["disk_reads"],
                "avg_latency_ms": summary["avg_latency_ms"],
                "max_duplication": summary["max_duplication"],
                "avg_wasted_memory_kb": summary["avg_wasted_memory_kb"],
            })

    summary_file = os.path.join(DATA_DIR, "mitigation_summary.csv")
    with open(summary_file, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=summary_rows[0].keys())
        writer.writeheader()
        writer.writerows(summary_rows)

    print("\n" + "=" * 70)
    print("MITIGATION SUMMARY")
    print("=" * 70)
    for row in summary_rows:
        print(
            f"{row['scenario']:<12} {row['strategy']:<16} "
            f"disk={row['disk_reads']:<3} "
            f"latency={row['avg_latency_ms']:<7.2f}ms "
            f"duplication={row['max_duplication']}"
        )
    print(f"\nSaved comparison summary: {summary_file}")


if __name__ == "__main__":
    main()
