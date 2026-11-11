"""
Full Simulator Orchestrator
Coordinates the DBMS Buffer Pool (Cache) and OS Page Cache (OSPageCache) across
the 3 coordination modes (Double Caching, O_DIRECT, posix_fadvise Coordinated).
Calculates per-step latencies, hit rates, memory duplication, and thrashing metrics.
"""

from dataclasses import dataclass
from typing import List, Dict, Any, Set, Optional

from simulator.cache import Cache, PageTableEntry, ReplacementPolicy
from simulator.os_cache import OSPageCache, CoordinationMode


@dataclass
class StepTelemetry:
    """Telemetry recorded for each memory reference step."""
    step_no: int
    page_id: int
    operation: str               # 'READ' or 'WRITE'
    hit_type: str                # 'DB_HIT', 'OS_HIT', or 'DISK_HIT'
    latency_ms: float
    db_cache_hit_ratio: float
    os_cache_hit_ratio: float
    duplication_rate: float      # Intersecting pages / Total unique pages cached
    cumulative_disk_reads: int
    is_thrashing_step: bool


class MemoryHierarchySimulator:
    """
    Simulates the dual-layer memory hierarchy:
      - Layer 1: DBMS Buffer Pool
      - Layer 2: OS Page Cache
      - Layer 3: Physical Disk Subsystem
    """

    # Architectural Latency Constants (milliseconds)
    LATENCY_DB_HIT_MS: float = 0.005       # L1: ~5 microseconds
    LATENCY_OS_HIT_MS: float = 0.050       # L2: ~50 microseconds (kernel trap + copy)
    LATENCY_DISK_HIT_MS: float = 5.000     # L3: ~5 milliseconds (mechanical seek/rotational)
    LATENCY_O_DIRECT_READ_MS: float = 4.800 # Direct I/O bypasses kernel memory copy overhead

    def __init__(
        self,
        db_cache_size: int = 50,
        os_cache_size: int = 50,
        policy: ReplacementPolicy = ReplacementPolicy.LRU,
        mode: CoordinationMode = CoordinationMode.DOUBLE_CACHING
    ):
        self.db_cache_size: int = db_cache_size
        self.os_cache_size: int = os_cache_size
        self.policy: ReplacementPolicy = policy
        self.mode: CoordinationMode = mode

        # Dual cache layer initialization
        self.db_buffer: Cache = Cache(
            capacity=db_cache_size,
            policy=policy,
            name="dbms_buffer_pool"
        )
        self.os_cache: OSPageCache = OSPageCache(
            capacity=os_cache_size,
            policy=policy,
            mode=mode
        )

        # Global metrics
        self.step_counter: int = 0
        self.cumulative_disk_reads: int = 0
        self.db_hits: int = 0
        self.os_hits: int = 0
        self.disk_hits: int = 0

    def set_future_workload(self, workload: List[int]) -> None:
        """Pre-seeds the workload stream for Optimal (Belady's) replacement policy."""
        self.db_buffer.set_future_workload(workload)
        if self.mode != CoordinationMode.O_DIRECT:
            self.os_cache.cache.set_future_workload(workload)

    def access_page(self, page_id: int, is_write: bool = False) -> StepTelemetry:
        """
        Simulates a single memory reference step through the dual-layer hierarchy.
        Enforces coordination protocol rules:
          - Double Caching: Page loaded into both DBMS and OS cache independently.
          - O_DIRECT: OS page cache is bypassed; misses fetch directly from disk.
          - Coordinated: On DBMS fetch, page is removed from OS cache via posix_fadvise(DONTNEED).
            When a clean page is evicted from DBMS, it is pushed into OS cache as an L2 entry.
        """
        self.step_counter += 1
        operation = "WRITE" if is_write else "READ"
        hit_type: str = "DISK_HIT"
        latency_ms: float = 0.0

        # ---------------------------------------------------------------------
        # 1. Check L1: DBMS Buffer Pool
        # ---------------------------------------------------------------------
        if self.db_buffer.contains(page_id):
            self.db_hits += 1
            hit_type = "DB_HIT"
            latency_ms = self.LATENCY_DB_HIT_MS
            self.db_buffer.get(page_id, current_step=self.step_counter)
            if is_write:
                # Mark dirty in DBMS buffer
                frame_idx = self.db_buffer.page_to_frame[page_id]
                self.db_buffer.frames[frame_idx].dirty_bit = True
        else:
            # -----------------------------------------------------------------
            # 2. Check L2: OS Page Cache (Based on Coordination Mode)
            # -----------------------------------------------------------------
            if self.mode == CoordinationMode.O_DIRECT:
                # O_DIRECT bypasses OS cache completely
                self.disk_hits += 1
                self.cumulative_disk_reads += 1
                hit_type = "DISK_HIT"
                latency_ms = self.LATENCY_O_DIRECT_READ_MS
                
                # Fetch into DBMS buffer pool directly
                evicted_db_pte = self.db_buffer.put(
                    page_id, current_step=self.step_counter, is_write=is_write
                )

            elif self.mode == CoordinationMode.COORDINATED:
                # Coordinated / Exclusive Victim Cache Mode
                if self.os_cache.contains(page_id):
                    self.os_hits += 1
                    hit_type = "OS_HIT"
                    latency_ms = self.LATENCY_OS_HIT_MS
                    
                    # Page is promoted to DBMS buffer; drop from OS cache (posix_fadvise DONTNEED)
                    self.os_cache.posix_fadvise_dontneed(page_id)
                else:
                    self.disk_hits += 1
                    self.cumulative_disk_reads += 1
                    hit_type = "DISK_HIT"
                    latency_ms = self.LATENCY_DISK_HIT_MS

                # Insert page into DBMS buffer pool
                evicted_db_pte = self.db_buffer.put(
                    page_id, current_step=self.step_counter, is_write=is_write
                )

                # If DBMS evicted a page, push it to OS cache as L2 victim
                if evicted_db_pte is not None:
                    self.os_cache.push_dbms_evicted_victim(
                        evicted_db_pte, current_step=self.step_counter
                    )

            else:
                # CoordinationMode.DOUBLE_CACHING (Default Uncoordinated)
                os_hit, _ = self.os_cache.handle_read(page_id, current_step=self.step_counter)
                if os_hit:
                    self.os_hits += 1
                    hit_type = "OS_HIT"
                    latency_ms = self.LATENCY_OS_HIT_MS
                else:
                    self.disk_hits += 1
                    self.cumulative_disk_reads += 1
                    hit_type = "DISK_HIT"
                    latency_ms = self.LATENCY_DISK_HIT_MS

                # Both DBMS and OS cache retain the page (Double Caching anomaly)
                evicted_db_pte = self.db_buffer.put(
                    page_id, current_step=self.step_counter, is_write=is_write
                )

        # ---------------------------------------------------------------------
        # 3. Compute Real-Time Telemetry & Duplication
        # ---------------------------------------------------------------------
        db_pages: Set[int] = self.db_buffer.get_resident_page_ids()
        os_pages: Set[int] = self.os_cache.get_resident_page_ids()

        total_unique_pages = len(db_pages.union(os_pages))
        duplicated_pages = len(db_pages.intersection(os_pages))

        if total_unique_pages > 0:
            duplication_rate = duplicated_pages / total_unique_pages
        else:
            duplication_rate = 0.0

        db_hit_ratio = self.db_hits / self.step_counter
        os_hit_ratio = self.os_hits / self.step_counter

        # Thrashing condition: heavy duplication coupled with a disk hit
        is_thrashing = (duplication_rate >= 0.40 and hit_type == "DISK_HIT")

        return StepTelemetry(
            step_no=self.step_counter,
            page_id=page_id,
            operation=operation,
            hit_type=hit_type,
            latency_ms=round(latency_ms, 4),
            db_cache_hit_ratio=round(db_hit_ratio, 4),
            os_cache_hit_ratio=round(os_hit_ratio, 4),
            duplication_rate=round(duplication_rate, 4),
            cumulative_disk_reads=self.cumulative_disk_reads,
            is_thrashing_step=is_thrashing
        )

    def run_workload(
        self,
        workload: List[int],
        write_probability: float = 0.2
    ) -> List[StepTelemetry]:
        """Executes a full sequence of memory page requests."""
        if self.policy == ReplacementPolicy.OPTIMAL:
            self.set_future_workload(workload)

        telemetry_log: List[StepTelemetry] = []
        for step, page_id in enumerate(workload):
            is_write = (step % int(1 / write_probability) == 0) if write_probability > 0 else False
            telemetry = self.access_page(page_id, is_write=is_write)
            telemetry_log.append(telemetry)

        return telemetry_log

    def reset(self) -> None:
        """Resets all simulation components and metrics."""
        self.step_counter = 0
        self.cumulative_disk_reads = 0
        self.db_hits = 0
        self.os_hits = 0
        self.disk_hits = 0
        self.db_buffer.clear()
        self.os_cache.reset_stats()