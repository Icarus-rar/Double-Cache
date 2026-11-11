"""
DBMS Buffer Pool, Concurrency Control & Strict 2PL Module
Implements:
- Lock Manager supporting Shared (S) and Exclusive (X) locks under Strict Two-Phase Locking (2PL).
- Thread synchronization using threading.Semaphore and threading.Lock to resolve the Readers-Writers problem.
- Wait-For Graph (WFG) cycle detection for Deadlock resolution, automatically aborting the younger transaction.
- Buffer Pool pinning/unpinning and dirty frame management.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum
import threading
import time
from typing import Dict, List, Optional, Set, Tuple

from simulator.cache import Cache, PageTableEntry, ReplacementPolicy


class LockType(str, Enum):
    SHARED = "S"         # Shared / Read Lock
    EXCLUSIVE = "X"      # Exclusive / Write Lock


class TransactionStatus(str, Enum):
    ACTIVE = "ACTIVE"
    COMMITTED = "COMMITTED"
    ABORTED = "ABORTED"


@dataclass
class Transaction:
    """Represents a database transaction executing across threads."""
    tx_id: str
    timestamp: float = field(default_factory=time.time)  # Used for young/old victim selection
    status: TransactionStatus = TransactionStatus.ACTIVE
    acquired_locks: Dict[int, LockType] = field(default_factory=dict)  # page_id -> LockType


class LockManager:
    """
    Strict 2PL Lock Manager with Wait-For Graph (WFG) Deadlock Detection.
    Resolves lock compatibility and tracks waiting dependencies.
    """

    def __init__(self):
        self._lock = threading.Lock()
        # page_id -> set of tx_ids holding SHARED locks
        self.shared_holders: Dict[int, Set[str]] = defaultdict(set)
        # page_id -> tx_id holding EXCLUSIVE lock (or None)
        self.exclusive_holder: Dict[int, Optional[str]] = defaultdict(lambda: None)
        # WFG: waiting_tx_id -> set of holding_tx_ids it is waiting on
        self.wait_for_graph: Dict[str, Set[str]] = defaultdict(set)
        # Registry of all known transactions
        self.transactions: Dict[str, Transaction] = {}
        # Condition variable for lock waits
        self._cv = threading.Condition(self._lock)

    def register_transaction(self, tx_id: str) -> Transaction:
        with self._lock:
            if tx_id not in self.transactions:
                self.transactions[tx_id] = Transaction(tx_id=tx_id)
            return self.transactions[tx_id]

    def acquire_lock(self, tx_id: str, page_id: int, lock_type: LockType) -> bool:
        """
        Attempts to acquire an S or X lock under Strict 2PL.
        If blocked, checks the Wait-For Graph for deadlocks. If a deadlock cycle is detected,
        aborts the younger transaction (the one with the higher timestamp).
        Returns True if lock acquired, False if the calling transaction was aborted.
        """
        with self._cv:
            tx = self.transactions.get(tx_id)
            if not tx or tx.status == TransactionStatus.ABORTED:
                return False

            while True:
                conflict_txs = self._get_conflicting_holders(tx_id, page_id, lock_type)
                if not conflict_txs:
                    # No conflict: grant lock
                    self._grant_lock(tx_id, page_id, lock_type)
                    # Clear any wait dependency for this tx
                    self.wait_for_graph[tx_id].clear()
                    return True

                # Record dependency in Wait-For Graph: tx_id is waiting on conflict_txs
                self.wait_for_graph[tx_id] = conflict_txs

                # Deadlock detection: search for cycles in WFG
                cycle = self._detect_deadlock_cycle(tx_id)
                if cycle:
                    # Pick the youngest transaction in the cycle as victim
                    victim_tx_id = max(
                        cycle, key=lambda tid: self.transactions[tid].timestamp
                    )
                    self._abort_transaction_locked(victim_tx_id)

                    # If this transaction was selected as victim, exit immediately
                    if victim_tx_id == tx_id:
                        self._cv.notify_all()
                        return False
                    # Else, a victim was removed; re-evaluate lock availability
                    continue

                # Wait until notified that locks have been released
                self._cv.wait()
                if self.transactions[tx_id].status == TransactionStatus.ABORTED:
                    return False

    def release_all_locks(self, tx_id: str) -> List[int]:
        """
        Strict 2PL: All acquired locks (both S and X) are held until transaction END
        (COMMIT or ABORT) and released simultaneously.
        Returns the list of unlocked page IDs.
        """
        with self._cv:
            return self._release_all_locks_locked(tx_id)

    def _release_all_locks_locked(self, tx_id: str) -> List[int]:
        tx = self.transactions.get(tx_id)
        if not tx:
            return []

        unlocked_pages = list(tx.acquired_locks.keys())
        for page_id in unlocked_pages:
            self.shared_holders[page_id].discard(tx_id)
            if self.exclusive_holder[page_id] == tx_id:
                self.exclusive_holder[page_id] = None

        tx.acquired_locks.clear()
        if tx_id in self.wait_for_graph:
            del self.wait_for_graph[tx_id]

        # Clean up any reverse wait references to this tx
        for waiting_tx, holders in list(self.wait_for_graph.items()):
            holders.discard(tx_id)

        self._cv.notify_all()
        return unlocked_pages

    def _get_conflicting_holders(
        self, tx_id: str, page_id: int, requested: LockType
    ) -> Set[str]:
        conflicts = set()
        current_x = self.exclusive_holder[page_id]

        if requested == LockType.SHARED:
            # S conflicts only if an X lock is held by another transaction
            if current_x and current_x != tx_id:
                conflicts.add(current_x)
        elif requested == LockType.EXCLUSIVE:
            # X conflicts if another tx holds X, or if any other tx holds S
            if current_x and current_x != tx_id:
                conflicts.add(current_x)
            for s_holder in self.shared_holders[page_id]:
                if s_holder != tx_id:
                    conflicts.add(s_holder)
        return conflicts

    def _grant_lock(self, tx_id: str, page_id: int, lock_type: LockType) -> None:
        tx = self.transactions[tx_id]
        if lock_type == LockType.SHARED:
            self.shared_holders[page_id].add(tx_id)
        else:
            self.exclusive_holder[page_id] = tx_id
        tx.acquired_locks[page_id] = lock_type

    def _detect_deadlock_cycle(self, start_tx: str) -> Optional[List[str]]:
        """DFS traversal on the Wait-For Graph to detect directed cycles."""
        visited = set()
        stack: List[str] = []

        def dfs(node: str) -> Optional[List[str]]:
            visited.add(node)
            stack.append(node)
            for neighbor in self.wait_for_graph.get(node, set()):
                if neighbor not in visited:
                    res = dfs(neighbor)
                    if res:
                        return res
                elif neighbor in stack:
                    # Cycle detected: return slice forming the cycle
                    idx = stack.index(neighbor)
                    return stack[idx:]
            stack.pop()
            return None

        return dfs(start_tx)

    def _abort_transaction_locked(self, tx_id: str) -> None:
        if tx_id in self.transactions:
            self.transactions[tx_id].status = TransactionStatus.ABORTED
            self._release_all_locks_locked(tx_id)


class DBMSBufferPool:
    """
    DBMS Buffer Pool Manager.
    Synchronizes concurrent thread access via threading.Semaphore and threading.Lock,
    solving the classic Readers-Writers / Critical Section problem.
    """

    def __init__(
        self,
        capacity: int = 50,
        policy: ReplacementPolicy = ReplacementPolicy.LRU,
        max_concurrent_readers: int = 16
    ):
        self.cache = Cache(capacity=capacity, policy=policy, name="dbms_buffer_pool")
        self.lock_mgr = LockManager()

        # Readers-Writers synchronization primitives
        self._rw_mutex = threading.Lock()
        self._reader_semaphore = threading.Semaphore(max_concurrent_readers)
        self._writer_lock = threading.Lock()
        self._active_readers: int = 0
        self._pin_counts: Dict[int, int] = defaultdict(int)

    def begin_transaction(self, tx_id: str) -> Transaction:
        return self.lock_mgr.register_transaction(tx_id)

    def read_page(
        self,
        tx_id: str,
        page_id: int,
        current_step: int = 0
    ) -> Tuple[bool, Optional[PageTableEntry], str]:
        """
        Reads a page under Strict 2PL:
        1. Acquire Shared (S) lock on the logical page.
        2. Synchronize frame access through Readers-Writers protocol.
        3. Pin page frame during reading, then unpin.
        Returns: (success: bool, pte: Optional[PageTableEntry], status_msg: str)
        """
        # Strict 2PL: S-lock
        if not self.lock_mgr.acquire_lock(tx_id, page_id, LockType.SHARED):
            return False, None, "DEADLOCK_ABORT"

        # Readers entry protocol
        self._reader_semaphore.acquire()
        with self._rw_mutex:
            self._active_readers += 1
            if self._active_readers == 1:
                self._writer_lock.acquire()  # First reader locks out writers

        try:
            self._pin_counts[page_id] += 1
            pte = self.cache.get(page_id, current_step=current_step)
            return True, pte, "HIT" if pte else "FAULT"
        finally:
            self._pin_counts[page_id] -= 1
            # Readers exit protocol
            with self._rw_mutex:
                self._active_readers -= 1
                if self._active_readers == 0:
                    self._writer_lock.release()  # Last reader releases writer lock
            self._reader_semaphore.release()

    def write_page(
        self,
        tx_id: str,
        page_id: int,
        current_step: int = 0
    ) -> Tuple[bool, Optional[PageTableEntry], str]:
        """
        Writes to a page under Strict 2PL:
        1. Acquire Exclusive (X) lock on the logical page.
        2. Acquire exclusive writer lock (blocking readers and other writers).
        3. Pin frame, mark dirty_bit and modify_bit, then unpin.
        Returns: (success: bool, evicted_pte: Optional[PageTableEntry], status_msg: str)
        """
        # Strict 2PL: X-lock
        if not self.lock_mgr.acquire_lock(tx_id, page_id, LockType.EXCLUSIVE):
            return False, None, "DEADLOCK_ABORT"

        with self._writer_lock:
            self._pin_counts[page_id] += 1
            try:
                evicted = self.cache.put(page_id, current_step=current_step, is_write=True)
                return True, evicted, "WRITTEN"
            finally:
                self._pin_counts[page_id] -= 1

    def commit_transaction(self, tx_id: str) -> None:
        """Strict 2PL: Commits transaction and releases all held locks."""
        tx = self.lock_mgr.transactions.get(tx_id)
        if tx:
            tx.status = TransactionStatus.COMMITTED
        self.lock_mgr.release_all_locks(tx_id)

    def abort_transaction(self, tx_id: str) -> None:
        """Strict 2PL: Aborts transaction and releases all held locks."""
        tx = self.lock_mgr.transactions.get(tx_id)
        if tx:
            tx.status = TransactionStatus.ABORTED
        self.lock_mgr.release_all_locks(tx_id)