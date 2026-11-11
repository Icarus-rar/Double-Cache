# experiments/scenario2.py
"""
Scenario 2: Hot-spot Load - Realistic access pattern
- 80% of accesses go to 20% of blocks (popular data)
- Shows how double caching gets worse with realistic patterns
"""

import sys
sys.path.append('..')

from simulator.full_simulator import FullSimulator
from simulator.workload import Workload

def run_scenario2():
    print("\n" + "="*70)
    print("SCENARIO 2: HOT-SPOT LOAD (Realistic Workload)")
    print("="*70)
    print("\nSetup:")
    print("- Database buffer pool: 10 blocks")
    print("- OS page cache: 10 blocks")
    print("- Total disk blocks: 100")
    print("- Workload: 80% of accesses go to 20% of blocks")
    print("- Example: Popular movies, trending products")
    print("- Expected: Heavy duplication on hot blocks")
    
    # Create simulator
    sim = FullSimulator(
        db_cache_size=10,
        os_cache_size=10,
        total_blocks=100
    )
    
    # Generate workload: hot-spot (realistic)
    workload = Workload.hotspot(
        num_accesses=30,
        hotspot_blocks=20,  # 20% of blocks
        total_blocks=100
    )
    print(f"\nWorkload: {len(workload)} accesses to {len(set(workload))} unique blocks")
    print(f"Access pattern: {workload[:20]}...")  # Show first 20
    
    # Run the workload
    sim.process_workload(workload)
    
    # Print final report
    sim.print_final_report()
    
    # Save results and print summary
    filename = sim.save_results("../data/scenario2_results.csv")
    summary = sim.get_summary()
    
    print("\n" + "="*70)
    print("SAVED DATA:")
    print("="*70)
    print(f"File: {filename}")
    print("Summary:")
    for key, value in summary.items():
        print(f"  {key}: {value}")
    
    return sim

if __name__ == "__main__":
    sim = run_scenario2()