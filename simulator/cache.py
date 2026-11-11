"""
Virtual Memory & Cache Module
Implements Page Table Entries (PTE) and Page Replacement Policies:
- FIFO (First-In, First-Out)
- Optimal (Belady's Algorithm with future reference lookahead)
- LRU (Least Recently Used)
- LFU (Least Frequently Used)
- Clock (Second-Chance Algorithm using reference_bit)
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Set, Any


class ReplacementPolicy(str, Enum):
    FIFO = "FIFO"
    OPTIMAL = "OPTIMAL"
    LRU = "LRU"
    LFU = "LFU"
    CLOCK = "CLOCK"


@dataclass
class PageTableEntry:
    """
    Formal Virtual Memory Page Table Entry (PTE).
    Tracks frame mapping, architectural status flags, and usage telemetry.
    """
    page_id: int
    frame_number: int
    valid_bit: bool = True          # 1 if page resides in a physical memory frame
    dirty_bit: bool = False         # 1 if page was modified while in memory
    reference_bit: bool = True      # Used by Clock (Second-Chance) algorithm
    modify_bit: bool = False        # Tracks whether disk writeback is required upon eviction
    
    # Internal eviction tracking
    load_order: int = 0             # Monotonically increasing sequence for FIFO
    last_accessed_step: int = 0     # Timestamp for LRU
    access_count: int = 1           # Frequency counter for LFU

    def touch(self, current_step: int, write: bool = False) -> None:
        """Updates architectural flags on a page access."""
        self.reference_bit = True
        self.last_accessed_step = current_step
        self.access_count += 1
        if write:
            self.dirty_bit = True
            self.modify_bit = True


class Cache:
    """
    Virtual Memory Frame Table & Page Cache Manager.
    Manages physical frames of fixed capacity under a selected replacement policy.
    """

    def __init__(
        self,
        capacity: int,
        policy: ReplacementPolicy = ReplacementPolicy.LRU,
        name: str = "cache"
    ):
        if capacity <= 0:
            raise ValueError("Cache capacity must be greater than zero.")
        
        self.capacity: int = capacity
        self.policy: ReplacementPolicy = policy
        self.name: str = name

        # Physical memory frames: frame_number -> PageTableEntry
        self.frames: Dict[int, PageTableEntry] = {}
        # Inverted index for lookup: page_id -> frame_number
        self.page_to_frame: Dict[int, int] = {}

        # Free list of frame numbers [0, capacity - 1]
        self.free_frames: List[int] = list(range(capacity - 1, -1, -1))

        # Sequencers and pointers
        self.clock_hand: int = 0
        self._load_sequence: int = 0

        # Workload future stream (required for Optimal / Belady's algorithm)
        self._future_workload: List[int] = []
        self._future_pointer: int = 0

    def set_future_workload(self, workload: List[int], current_step: int = 0) -> None:
        """Sets the sequence of upcoming page references for Belady's Optimal algorithm."""
        self._future_workload = workload
        self._future_pointer = current_step

    def contains(self, page_id: int) -> bool:
        """Checks if a page resides in memory and has a valid PTE."""
        if page_id in self.page_to_frame:
            frame_num = self.page_to_frame[page_id]
            pte = self.frames.get(frame_num)
            return pte is not None and pte.valid_bit
        return False

    def get(self, page_id: int, current_step: int = 0) -> Optional[PageTableEntry]:
        """
        Retrieves a PageTableEntry on read hit, updating reference and timestamp flags.
        Returns None on page fault.
        """
        if not self.contains(page_id):
            return None
        
        frame_num = self.page_to_frame[page_id]
        pte = self.frames[frame_num]
        pte.touch(current_step=current_step, write=False)
        return pte

    def put(
        self,
        page_id: int,
        current_step: int = 0,
        is_write: bool = False
    ) -> Optional[PageTableEntry]:
        """
        Inserts or updates a page in memory.
        If a frame is free, allocates it.
        If memory is full, selects and evicts a victim page using the configured policy.
        Returns the evicted PageTableEntry if an eviction occurred, else None.
        """
        # Case 1: Page already present in a physical frame (Cache Hit)
        if self.contains(page_id):
            frame_num = self.page_to_frame[page_id]
            pte = self.frames[frame_num]
            pte.touch(current_step=current_step, write=is_write)
            return None

        # Case 2: Page Fault with available free frames
        evicted_pte: Optional[PageTableEntry] = None
        if self.free_frames:
            assigned_frame = self.free_frames.pop()
        else:
            # Case 3: Page Fault with saturated frames -> Run Page Replacement
            assigned_frame, evicted_pte = self._select_and_evict_victim(current_step)

        # Allocate new PTE into the physical frame
        self._load_sequence += 1
        new_pte = PageTableEntry(
            page_id=page_id,
            frame_number=assigned_frame,
            valid_bit=True,
            dirty_bit=is_write,
            reference_bit=True,
            modify_bit=is_write,
            load_order=self._load_sequence,
            last_accessed_step=current_step,
            access_count=1
        )

        self.frames[assigned_frame] = new_pte
        self.page_to_frame[page_id] = assigned_frame
        return evicted_pte

    def remove(self, page_id: int) -> Optional[PageTableEntry]:
        """
        Explicitly removes an entry from cache (used by posix_fadvise DONTNEED).
        Frees the allocated physical frame.
        """
        if not self.contains(page_id):
            return None
        
        frame_num = self.page_to_frame.pop(page_id)
        pte = self.frames.pop(frame_num)
        pte.valid_bit = False
        self.free_frames.append(frame_num)
        return pte

    def get_resident_page_ids(self) -> Set[int]:
        """Returns the set of all virtual page IDs currently present in memory frames."""
        return set(self.page_to_frame.keys())

    def clear(self) -> None:
        """Flushes all physical frames."""
        self.frames.clear()
        self.page_to_frame.clear()
        self.free_frames = list(range(self.capacity - 1, -1, -1))
        self.clock_hand = 0
        self._load_sequence = 0

    # -------------------------------------------------------------------------
    # Page Replacement Policy Implementations
    # -------------------------------------------------------------------------
    def _select_and_evict_victim(self, current_step: int) -> tuple[int, PageTableEntry]:
        """
        Dispatches to the configured replacement algorithm to select a victim frame.
        Returns: (victim_frame_number, evicted_PageTableEntry)
        """
        if self.policy == ReplacementPolicy.FIFO:
            victim_frame = self._evict_fifo()
        elif self.policy == ReplacementPolicy.OPTIMAL:
            victim_frame = self._evict_optimal(current_step)
        elif self.policy == ReplacementPolicy.LRU:
            victim_frame = self._evict_lru()
        elif self.policy == ReplacementPolicy.LFU:
            victim_frame = self._evict_lfu()
        elif self.policy == ReplacementPolicy.CLOCK:
            victim_frame = self._evict_clock()
        else:
            victim_frame = self._evict_lru()

        victim_pte = self.frames[victim_frame]
        victim_pte.valid_bit = False
        
        # Remove from active mapping table
        del self.page_to_frame[victim_pte.page_id]
        del self.frames[victim_frame]

        return victim_frame, victim_pte

    def _evict_fifo(self) -> int:
        """First-In, First-Out: Evicts the page with the lowest load order."""
        return min(self.frames.keys(), key=lambda f: self.frames[f].load_order)

    def _evict_lru(self) -> int:
        """Least Recently Used: Evicts the page with the earliest last_accessed_step."""
        return min(self.frames.keys(), key=lambda f: self.frames[f].last_accessed_step)

    def _evict_lfu(self) -> int:
        """
        Least Frequently Used: Evicts the page with the lowest access_count.
        Ties are broken using LRU (last_accessed_step).
        """
        return min(
            self.frames.keys(),
            key=lambda f: (self.frames[f].access_count, self.frames[f].last_accessed_step)
        )

    def _evict_optimal(self, current_step: int) -> int:
        """
        Belady's Optimal Algorithm: Evicts the page that will not be used
        for the longest time in the future.
        """
        if not self._future_workload or current_step >= len(self._future_workload):
            # Fall back to LRU if future workload stream is exhausted
            return self._evict_lru()

        future_slice = self._future_workload[current_step:]
        next_use_distance: Dict[int, int] = {}

        for frame_num, pte in self.frames.items():
            try:
                # Find index of next appearance in upcoming workload
                dist = future_slice.index(pte.page_id)
                next_use_distance[frame_num] = dist
            except ValueError:
                # If page is never referenced again, it has the highest eviction priority
                next_use_distance[frame_num] = float("inf")

        # Evict frame with the maximum distance to next reference
        return max(next_use_distance.keys(), key=lambda f: next_use_distance[f])

    def _evict_clock(self) -> int:
        """
        Clock (Second-Chance) Algorithm:
        Cycles through physical frames using clock_hand. If reference_bit == 1,
        clears it to 0 and advances. If reference_bit == 0, selects it as victim.
        """
        frame_keys = sorted(list(self.frames.keys()))
        num_frames = len(frame_keys)

        while True:
            candidate_frame = frame_keys[self.clock_hand % num_frames]
            pte = self.frames[candidate_frame]

            if not pte.reference_bit:
                # Found victim with 0 reference bit
                self.clock_hand = (self.clock_hand + 1) % num_frames
                return candidate_frame
            else:
                # Clear second chance and move hand forward
                pte.reference_bit = False
                self.clock_hand = (self.clock_hand + 1) % num_frames