"""
OS Page Cache & System Call Coordination Engine
Implements OS Page Cache interactions across 3 coordination modes:
  1. DOUBLE_CACHING: Uncoordinated read/write via OS page cache; pages populate both caches.
  2. O_DIRECT: Kernel bypass mode; requests bypass the OS page cache entirely to access storage.
  3. COORDINATED: posix_fadvise(DONTNEED) emulation; clean victims evicted from the DBMS
     buffer pool are migrated into the OS cache as an exclusive L2 cache, preventing duplication.
"""

from enum import Enum
from typing import Optional, Set, Tuple
from simulator.cache import Cache, PageTableEntry, ReplacementPolicy


class CoordinationMode(str, Enum):
    DOUBLE_CACHING = "DOUBLE_CACHING"
    O_DIRECT = "O_DIRECT"
    COORDINATED = "COORDINATED"


class OSPageCache:
    """
    OS Kernel Page Cache.
    Manages filesystem page frames and system call abstractions (read, write, O_DIRECT, posix_fadvise).
    """

    def __init__(
        self,
        capacity: int,
        policy: ReplacementPolicy = ReplacementPolicy.LRU,
        mode: CoordinationMode = CoordinationMode.DOUBLE_CACHING
    ):
        self.capacity: int = capacity
        self.mode: CoordinationMode = mode
        self.cache: Cache = Cache(capacity=capacity, policy=policy, name="os_page_cache")

        # Telemetry counters
        self.hits: int = 0
        self.misses: int = 0
        self.disk_reads_incurred: int = 0
        self.fadvise_dontneed_calls: int = 0

    def set_coordination_mode(self, mode: CoordinationMode) -> None:
        """Switches the OS-DBMS coordination protocol."""
        self.mode = mode

    def contains(self, page_id: int) -> bool:
        """Returns True if the page resides in the OS Page Cache."""
        if self.mode == CoordinationMode.O_DIRECT:
            return False  # In O_DIRECT, OS page cache is completely bypassed
        return self.cache.contains(page_id)

    def handle_read(
        self,
        page_id: int,
        current_step: int = 0
    ) -> Tuple[bool, Optional[PageTableEntry]]:
        """
        Executes a read request against the OS Page Cache based on active coordination mode.
        Returns: (is_os_hit: bool, evicted_pte: Optional[PageTableEntry])
        """
        # Mode B: O_DIRECT System Call Mode
        # The DBMS sets the O_DIRECT flag during open(), bypassing kernel page cache entirely.
        if self.mode == CoordinationMode.O_DIRECT:
            self.misses += 1
            self.disk_reads_incurred += 1
            return False, None

        # Mode A (Double Caching) and Mode C (Coordinated Victim Cache)
        if self.cache.contains(page_id):
            self.hits += 1
            self.cache.get(page_id, current_step=current_step)
            return True, None
        else:
            self.misses += 1
            self.disk_reads_incurred += 1
            # Bring fetched block from physical storage into OS page cache
            evicted = self.cache.put(page_id, current_step=current_step, is_write=False)
            return False, evicted

    def handle_write(
        self,
        page_id: int,
        current_step: int = 0
    ) -> Tuple[bool, Optional[PageTableEntry]]:
        """
        Executes a write request (dirty page update).
        """
        if self.mode == CoordinationMode.O_DIRECT:
            # Writes bypass OS buffers directly to disk/controller write buffer
            self.disk_reads_incurred += 0
            return False, None

        is_hit = self.cache.contains(page_id)
        if is_hit:
            self.hits += 1
        else:
            self.misses += 1

        evicted = self.cache.put(page_id, current_step=current_step, is_write=True)
        return is_hit, evicted

    def posix_fadvise_dontneed(self, page_id: int) -> Optional[PageTableEntry]:
        """
        Emulates posix_fadvise(fd, offset, len, POSIX_FADV_DONTNEED).
        Directs the kernel to drop the page from the OS page cache since it is already
        safely buffered in the DBMS Buffer Pool, preventing double caching.
        """
        self.fadvise_dontneed_calls += 1
        return self.cache.remove(page_id)

    def push_dbms_evicted_victim(
        self,
        victim_pte: PageTableEntry,
        current_step: int = 0
    ) -> Optional[PageTableEntry]:
        """
        Mode C Exclusive Victim Caching:
        When DBMS Buffer Pool evicts a clean page, it hands it to the OS Cache as an L2 entry.
        """
        if self.mode != CoordinationMode.COORDINATED:
            return None
        
        return self.cache.put(
            page_id=victim_pte.page_id,
            current_step=current_step,
            is_write=victim_pte.dirty_bit
        )

    def get_resident_page_ids(self) -> Set[int]:
        """Returns the set of page IDs currently cached in kernel memory."""
        if self.mode == CoordinationMode.O_DIRECT:
            return set()
        return self.cache.get_resident_page_ids()

    def get_hit_ratio(self) -> float:
        """Calculates OS Page Cache hit ratio."""
        total = self.hits + self.misses
        return (self.hits / total) if total > 0 else 0.0

    def reset_stats(self) -> None:
        """Resets telemetry counters and clears cache frames."""
        self.hits = 0
        self.misses = 0
        self.disk_reads_incurred = 0
        self.fadvise_dontneed_calls = 0
        self.cache.clear()