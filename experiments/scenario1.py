# experiments/scenario1.py
"""
Scenario 1: Light Load - Normal conditions
- Small workload
- Both caches have plenty of space
- Shows basic double caching
"""

import sys
sys.path.append('..')

from simulator.full_simulator import FullSimulator
from simulator.workload import Workload

def run_scenario1():
    print("\n" + "="*70)
    print("SCENARIO 1: LIGHT LOAD")
    print("="*70)
    print("\nSetup:")
    print("- Database buffer pool: 5 blocks")
    print("- OS page cache: 5 blocks")
    print("- Total disk blocks: 100")
    print("- Workload: Sequential access (blocks 0-9)")
    print("- Expected: Both caches will hold same blocks = DOUBLE CACHING")
    
    # Create simulator
    sim = FullSimulator(
        db_cache_size=5,
        os_cache_size=5,
        total_blocks=100
    )
    
    # Generate workload: read blocks 0-9 sequentially
    workload = Workload.sequential(num_blocks=10, start_block=0)
    print(f"\nWorkload: {workload}")
    
    # Run the workload
    sim.process_workload(workload)
    
    # Print final report
    sim.print_final_report()
    
    # Save results and print summary
    filename = sim.save_results("../data/scenario1_results.csv")
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
    sim = run_scenario1()