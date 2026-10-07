# experiments/run_all_scenarios.py
"""
Run all three scenarios and compare results
"""

import sys
sys.path.append('..')

from scenario1 import run_scenario1
from scenario2 import run_scenario2
from scenario3 import run_scenario3

def main():
    print("\n\n")
    print("█" * 70)
    print("DOUBLE CACHING PROJECT - ALL SCENARIOS")
    print("█" * 70)
    
    # Run all scenarios
    print("\n\n")
    sim1 = run_scenario1()
    
    print("\n\n")
    input("Press Enter to continue to Scenario 2...")
    sim2 = run_scenario2()
    
    print("\n\n")
    input("Press Enter to continue to Scenario 3...")
    sim3 = run_scenario3()
    
    # Summary comparison
    print("\n\n")
    print("█" * 70)
    print("COMPARISON SUMMARY")
    print("█" * 70)
    
    def get_duplication(sim):
        db_blocks = set(sim.database.buffer_pool.get_blocks())
        os_blocks = set(sim.os_cache.get_blocks())
        return len(db_blocks.intersection(os_blocks))
    
    print("\nScenario 1 (Light Load):")
    print(f"  Duplication: {get_duplication(sim1)} blocks × 4KB = {get_duplication(sim1) * 4}KB")
    
    print("\nScenario 2 (Hot-spot Load):")
    print(f"  Duplication: {get_duplication(sim2)} blocks × 4KB = {get_duplication(sim2) * 4}KB")
    
    print("\nScenario 3 (Memory Pressure):")
    print(f"  Duplication: {get_duplication(sim3)} blocks × 4KB = {get_duplication(sim3) * 4}KB")
    print(f"  Disk reads (high!): {sim3.disk.stats['total_reads']}")
    
    print("\n" + "█" * 70)
    print("CONCLUSION:")
    print("█" * 70)
    print("Double caching wastes memory in ALL scenarios.")
    print("It becomes CRITICAL under memory pressure (Scenario 3).")
    print("This is what we're measuring in the research project.")
    print("█" * 70 + "\n")

if __name__ == "__main__":
    main()