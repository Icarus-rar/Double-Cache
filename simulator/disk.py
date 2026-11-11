"""
Disk Subsystem, Storage Allocation & Protection Module
Implements:
1. Disk Track Mapping (Cylinders 0 to 199)
2. Disk Head Scheduling Algorithms: FCFS, SSTF, SCAN, C-SCAN, LOOK
3. File Allocation Strategies: Contiguous, Linked, Indexed (Inode-based)
4. OS Protection Access Matrix across domains and object types
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Set, Tuple


# =============================================================================
# 1. Disk Scheduler & Seek Computation
# =============================================================================

class DiskSchedulingAlgorithm(str, Enum):
    FCFS = "FCFS"
    SSTF = "SSTF"
    SCAN = "SCAN"
    C_SCAN = "C_SCAN"
    LOOK = "LOOK"


@dataclass
class SeekResult:
    """Encapsulates the result of a disk head scheduling sequence."""
    algorithm: DiskSchedulingAlgorithm
    initial_head: int
    traversal_order: List[int]
    total_seek_distance: int
    average_seek_distance: float
    total_seek_time_ms: float


class DiskScheduler:
    """
    Simulates a physical hard disk drive arm and head movement across cylinders 0 to 199.
    Maps database virtual page IDs to physical disk tracks and computes seek times.
    """

    TOTAL_CYLINDERS: int = 200  # Tracks 0 through 199
    SEEK_TIME_PER_CYLINDER_MS: float = 0.04  # Average track-to-track seek time (ms)
    ROTATIONAL_LATENCY_MS: float = 2.00     # Rotational delay (7200 RPM nominal)

    def __init__(self, initial_head_position: int = 50, direction: str = "UP"):
        if not (0 <= initial_head_position < self.TOTAL_CYLINDERS):
            raise ValueError(f"Head position must be in [0, {self.TOTAL_CYLINDERS - 1}].")
        self.head_position: int = initial_head_position
        self.direction: str = direction.upper()  # "UP" (towards 199) or "DOWN" (towards 0)

    @classmethod
    def page_to_track(cls, page_id: int) -> int:
        """
        Deterministically maps a database page ID to a physical disk track (0 to 199).
        Uses a pseudo-random hash to reflect scatter across disk platters.
        """
        return (page_id * 37 + 13) % cls.TOTAL_CYLINDERS

    def compute_seek_cost(self, traversal_order: List[int], initial_head: int) -> Tuple[int, float, float]:
        """Calculates total cylinders traversed, average seek distance, and total seek time."""
        total_distance = 0
        current = initial_head
        for track in traversal_order:
            total_distance += abs(track - current)
            current = track

        req_count = len(traversal_order)
        avg_distance = (total_distance / req_count) if req_count > 0 else 0.0
        seek_time_ms = (total_distance * self.SEEK_TIME_PER_CYLINDER_MS) + (req_count * self.ROTATIONAL_LATENCY_MS)
        return total_distance, round(avg_distance, 2), round(seek_time_ms, 3)

    def schedule_fcfs(self, requests: List[int], initial_head: Optional[int] = None) -> SeekResult:
        """First-Come, First-Served (FCFS) Disk Scheduling."""
        head = self.head_position if initial_head is None else initial_head
        traversal = list(requests)
        dist, avg_dist, seek_time = self.compute_seek_cost(traversal, head)
        return SeekResult(
            algorithm=DiskSchedulingAlgorithm.FCFS,
            initial_head=head,
            traversal_order=traversal,
            total_seek_distance=dist,
            average_seek_distance=avg_dist,
            total_seek_time_ms=seek_time
        )

    def schedule_sstf(self, requests: List[int], initial_head: Optional[int] = None) -> SeekResult:
        """Shortest Seek Time First (SSTF) Disk Scheduling."""
        head = self.head_position if initial_head is None else initial_head
        unvisited = list(requests)
        traversal: List[int] = []
        current = head

        while unvisited:
            closest_idx = min(range(len(unvisited)), key=lambda i: abs(unvisited[i] - current))
            next_track = unvisited.pop(closest_idx)
            traversal.append(next_track)
            current = next_track

        dist, avg_dist, seek_time = self.compute_seek_cost(traversal, head)
        return SeekResult(
            algorithm=DiskSchedulingAlgorithm.SSTF,
            initial_head=head,
            traversal_order=traversal,
            total_seek_distance=dist,
            average_seek_distance=avg_dist,
            total_seek_time_ms=seek_time
        )

    def schedule_scan(
        self,
        requests: List[int],
        initial_head: Optional[int] = None,
        direction: Optional[str] = None
    ) -> SeekResult:
        """
        SCAN (Elevator) Disk Scheduling:
        Moves head towards one boundary, servicing requests, reaches boundary (0 or 199),
        then reverses direction.
        """
        head = self.head_position if initial_head is None else initial_head
        dir_to_use = (direction or self.direction).upper()
        if not requests:
            return SeekResult(DiskSchedulingAlgorithm.SCAN, head, [], 0, 0.0, 0.0)

        lower = sorted([r for r in requests if r < head])
        higher = sorted([r for r in requests if r >= head])

        traversal: List[int] = []
        if dir_to_use == "UP":
            traversal.extend(higher)
            if lower:
                # Travel all the way to maximum track (199) before reversing
                if traversal and traversal[-1] != (self.TOTAL_CYLINDERS - 1):
                    traversal.append(self.TOTAL_CYLINDERS - 1)
                traversal.extend(reversed(lower))
        else:
            traversal.extend(reversed(lower))
            if higher:
                # Travel all the way to cylinder 0 before reversing
                if traversal and traversal[-1] != 0:
                    traversal.append(0)
                traversal.extend(higher)

        dist, avg_dist, seek_time = self.compute_seek_cost(traversal, head)
        return SeekResult(
            algorithm=DiskSchedulingAlgorithm.SCAN,
            initial_head=head,
            traversal_order=traversal,
            total_seek_distance=dist,
            average_seek_distance=avg_dist,
            total_seek_time_ms=seek_time
        )

    def schedule_c_scan(
        self,
        requests: List[int],
        initial_head: Optional[int] = None,
        direction: Optional[str] = None
    ) -> SeekResult:
        """
        Circular SCAN (C-SCAN) Disk Scheduling:
        Moves head in one direction to the boundary, resets to the opposite boundary
        without servicing requests on return, and continues in the same direction.
        """
        head = self.head_position if initial_head is None else initial_head
        dir_to_use = (direction or self.direction).upper()
        if not requests:
            return SeekResult(DiskSchedulingAlgorithm.C_SCAN, head, [], 0, 0.0, 0.0)

        lower = sorted([r for r in requests if r < head])
        higher = sorted([r for r in requests if r >= head])

        traversal: List[int] = []
        if dir_to_use == "UP":
            traversal.extend(higher)
            if lower:
                if traversal and traversal[-1] != (self.TOTAL_CYLINDERS - 1):
                    traversal.append(self.TOTAL_CYLINDERS - 1)
                traversal.append(0)
                traversal.extend(lower)
        else:
            traversal.extend(reversed(lower))
            if higher:
                if traversal and traversal[-1] != 0:
                    traversal.append(0)
                traversal.append(self.TOTAL_CYLINDERS - 1)
                traversal.extend(reversed(higher))

        dist, avg_dist, seek_time = self.compute_seek_cost(traversal, head)
        return SeekResult(
            algorithm=DiskSchedulingAlgorithm.C_SCAN,
            initial_head=head,
            traversal_order=traversal,
            total_seek_distance=dist,
            average_seek_distance=avg_dist,
            total_seek_time_ms=seek_time
        )

    def schedule_look(
        self,
        requests: List[int],
        initial_head: Optional[int] = None,
        direction: Optional[str] = None
    ) -> SeekResult:
        """
        LOOK Disk Scheduling:
        Similar to SCAN, but only travels as far as the last request in the current
        direction before reversing, without hitting cylinder 0 or 199 unnecessarily.
        """
        head = self.head_position if initial_head is None else initial_head
        dir_to_use = (direction or self.direction).upper()
        if not requests:
            return SeekResult(DiskSchedulingAlgorithm.LOOK, head, [], 0, 0.0, 0.0)

        lower = sorted([r for r in requests if r < head])
        higher = sorted([r for r in requests if r >= head])

        traversal: List[int] = []
        if dir_to_use == "UP":
            traversal.extend(higher)
            traversal.extend(reversed(lower))
        else:
            traversal.extend(reversed(lower))
            traversal.extend(higher)

        dist, avg_dist, seek_time = self.compute_seek_cost(traversal, head)
        return SeekResult(
            algorithm=DiskSchedulingAlgorithm.LOOK,
            initial_head=head,
            traversal_order=traversal,
            total_seek_distance=dist,
            average_seek_distance=avg_dist,
            total_seek_time_ms=seek_time
        )


# =============================================================================
# 2. File Allocation Module
# =============================================================================

class AllocationMethod(str, Enum):
    CONTIGUOUS = "CONTIGUOUS"
    LINKED = "LINKED"
    INDEXED = "INDEXED"


@dataclass
class LinkedNode:
    """Linked allocation node pointing to next disk sector/block."""
    block_id: int
    next_block_id: Optional[int] = None


@dataclass
class Inode:
    """UNIX-style Inode structure supporting Direct, Single Indirect, and Double Indirect blocks."""
    file_id: str
    file_size_blocks: int
    direct_blocks: List[int] = field(default_factory=list)          # Up to 10 direct block addresses
    single_indirect_block: Optional[int] = None                     # Points to an index block of addresses
    double_indirect_block: Optional[int] = None                     # Points to index of index blocks


class FileAllocator:
    """
    Simulates Operating System File Allocation Strategies:
    - Contiguous Allocation: Fast sequential access, prone to external fragmentation.
    - Linked Allocation: No external fragmentation, slow random access.
    - Indexed Allocation (Inode): Efficient direct and sequential access using index blocks.
    """

    TOTAL_BLOCKS: int = 1000
    DIRECT_BLOCKS_LIMIT: int = 10
    BLOCKS_PER_INDEX_BLOCK: int = 64

    def __init__(self, total_blocks: int = 1000):
        self.total_blocks: int = total_blocks
        self.free_blocks: Set[int] = set(range(total_blocks))

        # Metadata stores per allocation strategy
        self.contiguous_files: Dict[str, Tuple[int, int]] = {}  # file_name -> (start_block, length)
        self.linked_files: Dict[str, List[LinkedNode]] = {}     # file_name -> chain of nodes
        self.inodes: Dict[str, Inode] = {}                      # file_name -> Inode

    # -------------------------------------------------------------------------
    # Contiguous Allocation
    # -------------------------------------------------------------------------
    def allocate_contiguous(self, file_name: str, num_blocks: int) -> bool:
        """Allocates a continuous run of disk blocks (First-Fit)."""
        if num_blocks <= 0:
            return False

        # Find continuous sequence of free blocks
        start = -1
        current_len = 0
        for b in range(self.total_blocks):
            if b in self.free_blocks:
                if current_len == 0:
                    start = b
                current_len += 1
                if current_len == num_blocks:
                    break
            else:
                current_len = 0
                start = -1

        if current_len < num_blocks:
            return False  # External fragmentation: no contiguous chunk available

        allocated_blocks = list(range(start, start + num_blocks))
        for b in allocated_blocks:
            self.free_blocks.remove(b)

        self.contiguous_files[file_name] = (start, num_blocks)
        return True

    def read_contiguous_block(self, file_name: str, logical_offset: int) -> Optional[int]:
        """Directly computes physical block address via base + offset."""
        if file_name not in self.contiguous_files:
            return None
        start, length = self.contiguous_files[file_name]
        if logical_offset < 0 or logical_offset >= length:
            return None
        return start + logical_offset

    # -------------------------------------------------------------------------
    # Linked Allocation
    # -------------------------------------------------------------------------
    def allocate_linked(self, file_name: str, num_blocks: int) -> bool:
        """Allocates any available scattered free blocks and chains them together."""
        if len(self.free_blocks) < num_blocks or num_blocks <= 0:
            return False

        chosen_blocks = sorted(list(self.free_blocks))[:num_blocks]
        chain: List[LinkedNode] = []

        for i, b in enumerate(chosen_blocks):
            self.free_blocks.remove(b)
            next_b = chosen_blocks[i + 1] if i + 1 < num_blocks else None
            chain.append(LinkedNode(block_id=b, next_block_id=next_b))

        self.linked_files[file_name] = chain
        return True

    def read_linked_block(self, file_name: str, logical_offset: int) -> Tuple[Optional[int], int]:
        """
        Traverses pointer chain to find block at logical_offset.
        Returns (physical_block_id, pointer_hops_incurred).
        """
        if file_name not in self.linked_files:
            return None, 0
        chain = self.linked_files[file_name]
        if logical_offset < 0 or logical_offset >= len(chain):
            return None, 0

        # Traverse sequential chain
        hops = 0
        current_node = chain[0]
        while hops < logical_offset:
            hops += 1
            current_node = chain[hops]

        return current_node.block_id, hops

    # -------------------------------------------------------------------------
    # Indexed Allocation (Inode)
    # -------------------------------------------------------------------------
    def allocate_indexed(self, file_name: str, num_blocks: int) -> bool:
        """Allocates direct, single indirect, and double indirect data blocks for an Inode."""
        if num_blocks <= 0:
            return False

        # Calculate required overhead blocks for indirect pointers
        single_ind_needed = 1 if num_blocks > self.DIRECT_BLOCKS_LIMIT else 0
        rem = max(0, num_blocks - self.DIRECT_BLOCKS_LIMIT - self.BLOCKS_PER_INDEX_BLOCK)
        double_ind_needed = (1 + (rem + self.BLOCKS_PER_INDEX_BLOCK - 1) // self.BLOCKS_PER_INDEX_BLOCK) if rem > 0 else 0

        total_needed = num_blocks + single_ind_needed + double_ind_needed
        if len(self.free_blocks) < total_needed:
            return False

        allocated = sorted(list(self.free_blocks))[:total_needed]
        for b in allocated:
            self.free_blocks.remove(b)

        # Distribute into Inode pointers
        direct_cnt = min(num_blocks, self.DIRECT_BLOCKS_LIMIT)
        direct_blocks = allocated[:direct_cnt]
        idx = direct_cnt

        single_ind_block = None
        if single_ind_needed:
            single_ind_block = allocated[idx]
            idx += 1

        double_ind_block = None
        if double_ind_needed:
            double_ind_block = allocated[idx]
            idx += 1

        inode = Inode(
            file_id=file_name,
            file_size_blocks=num_blocks,
            direct_blocks=direct_blocks,
            single_indirect_block=single_ind_block,
            double_indirect_block=double_ind_block
        )
        self.inodes[file_name] = inode
        return True

    def read_indexed_block(self, file_name: str, logical_offset: int) -> Tuple[Optional[int], int]:
        """
        Resolves physical block using Inode direct/indirect pointers.
        Returns (physical_block_id, index_table_lookups).
        """
        if file_name not in self.inodes:
            return None, 0
        inode = self.inodes[file_name]
        if logical_offset < 0 or logical_offset >= inode.file_size_blocks:
            return None, 0

        # Direct block access
        if logical_offset < len(inode.direct_blocks):
            return inode.direct_blocks[logical_offset], 0

        # Single indirect access (1 table lookup)
        offset_in_single = logical_offset - self.DIRECT_BLOCKS_LIMIT
        if offset_in_single < self.BLOCKS_PER_INDEX_BLOCK:
            # Emulated block location from single indirect block
            simulated_block = (inode.single_indirect_block or 0) + 1 + offset_in_single
            return simulated_block, 1

        # Double indirect access (2 table lookups)
        offset_in_double = offset_in_single - self.BLOCKS_PER_INDEX_BLOCK
        simulated_block = (inode.double_indirect_block or 0) + 1 + offset_in_double
        return simulated_block, 2


# =============================================================================
# 3. OS Protection Access Matrix
# =============================================================================

class Domain(str, Enum):
    USER_APP = "USER_APP"
    DBMS_ENGINE = "DBMS_ENGINE"
    OS_KERNEL = "OS_KERNEL"


class ObjectType(str, Enum):
    BUFFER_POOL = "BUFFER_POOL"
    PAGE_CACHE = "PAGE_CACHE"
    WAL_LOG = "WAL_LOG"
    DISK_RAW_BLOCK = "DISK_RAW_BLOCK"


class Right(str, Enum):
    READ = "READ"
    WRITE = "WRITE"
    DIRECT_IO = "DIRECT_IO"
    FLUSH = "FLUSH"


class AccessMatrix:
    """
    Enforces the OS Protection Model via an Access Matrix.
    Controls access rights [Read, Write, Direct_IO, Flush] across Domains and Objects.
    """

    def __init__(self):
        # Matrix: (Domain, ObjectType) -> Set[Right]
        self.matrix: Dict[Tuple[Domain, ObjectType], Set[Right]] = {}
        self._initialize_default_policy()

    def _initialize_default_policy(self) -> None:
        """Sets standard security constraints for User Applications, DBMS, and OS Kernel."""
        # 1. USER_APP Domain: Highly restricted
        self.grant(Domain.USER_APP, ObjectType.BUFFER_POOL, {Right.READ})
        self.grant(Domain.USER_APP, ObjectType.PAGE_CACHE, set())
        self.grant(Domain.USER_APP, ObjectType.WAL_LOG, set())
        self.grant(Domain.USER_APP, ObjectType.DISK_RAW_BLOCK, set())

        # 2. DBMS_ENGINE Domain: Buffer pool owner, uses direct I/O and manages WAL
        self.grant(Domain.DBMS_ENGINE, ObjectType.BUFFER_POOL, {Right.READ, Right.WRITE, Right.DIRECT_IO, Right.FLUSH})
        self.grant(Domain.DBMS_ENGINE, ObjectType.PAGE_CACHE, {Right.READ, Right.WRITE, Right.FLUSH})
        self.grant(Domain.DBMS_ENGINE, ObjectType.WAL_LOG, {Right.READ, Right.WRITE, Right.DIRECT_IO, Right.FLUSH})
        self.grant(Domain.DBMS_ENGINE, ObjectType.DISK_RAW_BLOCK, {Right.DIRECT_IO})

        # 3. OS_KERNEL Domain: Full authority over page cache and raw disk blocks
        self.grant(Domain.OS_KERNEL, ObjectType.BUFFER_POOL, set())
        self.grant(Domain.OS_KERNEL, ObjectType.PAGE_CACHE, {Right.READ, Right.WRITE, Right.FLUSH})
        self.grant(Domain.OS_KERNEL, ObjectType.WAL_LOG, {Right.READ, Right.WRITE, Right.FLUSH})
        self.grant(Domain.OS_KERNEL, ObjectType.DISK_RAW_BLOCK, {Right.READ, Right.WRITE, Right.FLUSH})

    def grant(self, domain: Domain, target_object: ObjectType, rights: Set[Right]) -> None:
        """Grants permission rights to a domain for a specific object."""
        self.matrix[(domain, target_object)] = set(rights)

    def revoke(self, domain: Domain, target_object: ObjectType, right: Right) -> None:
        """Revokes a specific permission right."""
        key = (domain, target_object)
        if key in self.matrix and right in self.matrix[key]:
            self.matrix[key].remove(right)

    def check_permission(self, domain: Domain, target_object: ObjectType, requested_right: Right) -> bool:
        """
        Verifies whether a domain possesses the requested right for an object.
        Returns True if granted, False if unauthorized (raises Protection Fault).
        """
        key = (domain, target_object)
        rights_granted = self.matrix.get(key, set())
        return requested_right in rights_granted