# simulator/workload.py
"""
Workload Generator: Different access patterns for testing
"""

import random

class Workload:
    """Generate different access patterns"""
    
    @staticmethod
    def sequential(num_blocks=100, start_block=0):
        """
        Sequential access: Read blocks in order
        Example: 0, 1, 2, 3, ...
        """
        return list(range(start_block, start_block + num_blocks))
    
    @staticmethod
    def random(num_accesses=100, total_blocks=1000):
        """
        Random access: Random blocks
        Example: 523, 100, 987, ...
        """
        return [random.randint(0, total_blocks - 1) for _ in range(num_accesses)]
    
    @staticmethod
    def hotspot(num_accesses=100, hotspot_blocks=20, total_blocks=1000):
        """
        Hot-spot access: 80% of accesses go to 20% of blocks
        Example: Frequently used data (popular movies, active users)
        """
        hotspot = list(range(0, hotspot_blocks))
        cold = list(range(hotspot_blocks, total_blocks))
        
        accesses = []
        for _ in range(num_accesses):
            # 80% chance to access hotspot
            if random.random() < 0.8:
                accesses.append(random.choice(hotspot))
            else:
                accesses.append(random.choice(cold))
        
        return accesses
    
    @staticmethod
    def mixed(num_accesses=100, total_blocks=1000):
        """
        Mixed access: 50% sequential, 50% random
        Realistic database workload
        """
        accesses = []
        for _ in range(num_accesses):
            if random.random() < 0.5:
                # Sequential
                block = random.randint(0, total_blocks - 100)
                accesses.append(block)
            else:
                # Random
                accesses.append(random.randint(0, total_blocks - 1))
        
        return accessesS