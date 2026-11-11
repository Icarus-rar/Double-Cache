# experiments/scenario3.py
"""
Scenario 3: Memory Pressure - Limited cache space
- Small caches relative to workload
- Shows how double caching causes performance collapse under pressure
"""

import sys
sys.path.append('..')

from simulator.full_simulator import FullSimulator
from simulator.workload import Workload

def run_scenario3():
    print("\n" + "="*70)
    print("SCENARIO 3: MEMORY PRESSURE (Limited Resources)")
    print("="*70)
    print("\nSetup:")
    print("- Database buffer pool: 3 blocks (VERY SMALL)")
    print("- OS page cache: 3 blocks (VERY SMALL)")
    print("- Total disk blocks: 100")
    print("- Workload: 50 random accesses")
    print("- Expected: Lots of evictions, high disk I/O due to duplication")
    print("- Problem: Both caches waste space on same blocks")
    
    # Create simulator
    sim = FullSimulator(
        db_cache_size=3,      # Tiny!
        os_cache_size=3,      # Tiny!
        total_blocks=100
    )
    
    # Generate workload: random (unpredictable access)
    workload = Workload.random(
        num_accesses=50,
        total_blocks=100
    )
    print(f"\nWorkload: {len(workload)} random accesses")
    print(f"Unique blocks: {len(set(workload))}")
    
    # Run the workload
    sim.process_workload(workload)
    
    # Print final report
    sim.print_final_report()
    
    # Save results and print summary
    filename = sim.save_results("../data/scenario3_results.csv")
    summary = sim.get_summary()
    
    print("\n" + "="*70)
    print("SAVED DATA:")
    print("="*70)
    print(f"File: {filename}")
    print("Summary:")
    for key, value in summary.items():
        print(f"  {key}: {value}")
    
    print("\n" + "="*70)
    print("KEY INSIGHT:")
    print("="*70)
    print("With limited caches (3 blocks each), both caches duplicate blocks.")
    print("This means effectively we're caching only ~3-4 unique blocks total")
    print("(not 6), causing eviction thrashing and high disk I/O.")
    print("="*70)
    
    return sim

if __name__ == "__main__":
    sim = run_scenario3()