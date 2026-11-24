# simulator/workload.py
"""
Workload Generator: Different access patterns for testing
"""

import random
from typing import List, Tuple


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
        
        return accesses


def _build_trace(
    scenario_name: str = "scenario1",
    num_steps: int = 500,
    write_ratio: float = 0.2,
    seed: int = 42,
) -> List[Tuple[int, str]]:
    """
    Internal: builds a deterministic (page_id, operation) access trace for
    real-world OS + DBMS memory contention scenarios.
    """
    rng = random.Random(seed)
    trace: List[Tuple[int, str]] = []

    if scenario_name == "scenario2":
        # Netflix Streaming / CDN: 30% hot metadata (0..5) + 70% sequential media scan (100+)
        stream_cursor = 100
        for _ in range(num_steps):
            if rng.random() < 0.30:
                page_id = rng.randint(0, 5)
                op = "WRITE" if rng.random() < (write_ratio * 0.5) else "READ"
            else:
                page_id = stream_cursor
                stream_cursor += 1
                op = "READ"
            trace.append((page_id, op))

    elif scenario_name == "scenario3":
        # Hypervisor Multi-Tenant Noisy Neighbor:
        # Phase 1: Tenant A steady OLTP (10..22)
        # Phase 2 (after 40% of steps): Tenant B bulk backup scan (200+) + Tenant A
        backup_cursor = 200
        switch_point = int(num_steps * 0.40)
        for step in range(num_steps):
            if step >= switch_point and rng.random() < 0.65:
                page_id = backup_cursor
                backup_cursor += 1
                op = "READ"
            else:
                page_id = rng.randint(10, 22)
                op = "WRITE" if rng.random() < write_ratio else "READ"
            trace.append((page_id, op))

    elif scenario_name == "scenario4":
        # Windows RAMMap Validation: Full Table Scan
        # Sequential reads simulating SELECT COUNT(*) on flash_sale_inventory.ibd
        # Floods both caches exactly as shown in the empirical physical experiment.
        for step in range(num_steps):
            trace.append((step, "READ"))

    else:
        # scenario1 (Default): E-Commerce Flash Sale (80/20 Hot-Spot Skew on pages 0..19)
        for _ in range(num_steps):
            if rng.random() < 0.80:
                page_id = rng.randint(0, 19)
            else:
                page_id = rng.randint(20, 119)
            op = "WRITE" if rng.random() < write_ratio else "READ"
            trace.append((page_id, op))

    return trace


def generate_workload(
    scenario_name: str = "scenario1",
    num_steps: int = 500,
    write_ratio: float = 0.2,
    seed: int = 42,
    total_blocks: int = 1000,
) -> list[int]:
    """
    Public: returns only page IDs. Backwards-compatible with
    MemoryHierarchySimulator.run_workload(workload: List[int]).

    `total_blocks` is accepted for backwards compatibility with older
    callers and is currently unused — scenario ranges are fixed by design.
    """
    return [page_id for page_id, _ in _build_trace(scenario_name, num_steps, write_ratio, seed)]


def generate_workload_with_ops(
    scenario_name: str = "scenario1",
    num_steps: int = 500,
    write_ratio: float = 0.2,
    seed: int = 42,
) -> List[Tuple[int, str]]:
    """
    Public: returns full (page_id, op) traces. Use this only if/when
    run_workload() is upgraded to consume operations alongside page IDs.
    """
    return _build_trace(scenario_name, num_steps, write_ratio, seed)