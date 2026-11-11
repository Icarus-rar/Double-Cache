"""
Write-Ahead Logging (WAL) & ARIES Crash Recovery Module
Implements:
- Structured WAL records: <LSN, TX_ID, RECORD_TYPE, PAGE_ID, OLD_VAL, NEW_VAL, PREV_LSN>.
- Checkpointing: flushes dirty pages and records active transaction table.
- ARIES-style 3-Phase Crash Recovery:
    Phase 1: Analysis - Identifies dirty pages and uncommitted transactions (loser transactions).
    Phase 2: Redo - Replays all history forward from the checkpoint LSN to reconstruct crash state.
    Phase 3: Undo - Reverses active/loser transactions in reverse LSN order to restore consistency.
"""

from dataclasses import dataclass, field
from enum import Enum
import json
from typing import Any, Dict, List, Optional, Set, Tuple


class RecordType(str, Enum):
    BEGIN = "BEGIN"
    UPDATE = "UPDATE"
    COMMIT = "COMMIT"
    ABORT = "ABORT"
    CHECKPOINT = "CHECKPOINT"
    CLR = "CLR"  # Compensation Log Record for undone operations


@dataclass
class WALRecord:
    """Formal Write-Ahead Log Record: <LSN, TX_ID, TYPE, PAGE_ID, OLD_VAL, NEW_VAL, PREV_LSN>."""
    lsn: int
    tx_id: str
    record_type: RecordType
    page_id: Optional[int] = None
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None
    prev_lsn: int = 0
    undone: bool = False  # Set to True when processed by ARIES Undo

    def to_dict(self) -> Dict[str, Any]:
        return {
            "lsn": self.lsn,
            "tx_id": self.tx_id,
            "record_type": self.record_type.value,
            "page_id": self.page_id,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "prev_lsn": self.prev_lsn
        }


class WALManager:
    """
    Write-Ahead Log Engine.
    Enforces the WAL Protocol: Log records MUST reach persistent storage before
    corresponding dirty pages in the volatile buffer pool can be written to disk.
    """

    def __init__(self):
        self.log: List[WALRecord] = []
        self._lsn_counter: int = 0
        self.last_tx_lsn: Dict[str, int] = {}       # tx_id -> last recorded LSN
        self.checkpoint_lsn: int = 0                # LSN of the latest checkpoint
        self.active_transactions: Set[str] = set()

        # Simulated persistent page storage (Disk) vs. Volatile Buffer Pool state
        self.persistent_disk_state: Dict[int, Any] = {}
        self.volatile_buffer_state: Dict[int, Any] = {}

    def _next_lsn(self) -> int:
        self._lsn_counter += 1
        return self._lsn_counter

    def log_begin(self, tx_id: str) -> int:
        lsn = self._next_lsn()
        record = WALRecord(
            lsn=lsn,
            tx_id=tx_id,
            record_type=RecordType.BEGIN,
            prev_lsn=self.last_tx_lsn.get(tx_id, 0)
        )
        self.log.append(record)
        self.last_tx_lsn[tx_id] = lsn
        self.active_transactions.add(tx_id)
        return lsn

    def log_update(
        self,
        tx_id: str,
        page_id: int,
        old_val: Any,
        new_val: Any
    ) -> int:
        """Logs an update delta and updates volatile cache state."""
        lsn = self._next_lsn()
        record = WALRecord(
            lsn=lsn,
            tx_id=tx_id,
            record_type=RecordType.UPDATE,
            page_id=page_id,
            old_value=old_val,
            new_value=new_val,
            prev_lsn=self.last_tx_lsn.get(tx_id, 0)
        )
        self.log.append(record)
        self.last_tx_lsn[tx_id] = lsn
        # Update volatile buffer state immediately
        self.volatile_buffer_state[page_id] = new_val
        return lsn

    def log_commit(self, tx_id: str) -> int:
        lsn = self._next_lsn()
        record = WALRecord(
            lsn=lsn,
            tx_id=tx_id,
            record_type=RecordType.COMMIT,
            prev_lsn=self.last_tx_lsn.get(tx_id, 0)
        )
        self.log.append(record)
        self.last_tx_lsn[tx_id] = lsn
        self.active_transactions.discard(tx_id)
        return lsn

    def log_abort(self, tx_id: str) -> int:
        lsn = self._next_lsn()
        record = WALRecord(
            lsn=lsn,
            tx_id=tx_id,
            record_type=RecordType.ABORT,
            prev_lsn=self.last_tx_lsn.get(tx_id, 0)
        )
        self.log.append(record)
        self.last_tx_lsn[tx_id] = lsn
        self.active_transactions.discard(tx_id)
        return lsn

    def checkpoint(self) -> int:
        """
        Creates a Checkpoint:
        1. Writes a CHECKPOINT record containing the current Transaction Table.
        2. Flushes all volatile buffer pages to persistent disk.
        """
        lsn = self._next_lsn()
        record = WALRecord(
            lsn=lsn,
            tx_id="SYSTEM",
            record_type=RecordType.CHECKPOINT,
            new_value={"active_txs": list(self.active_transactions)},
            prev_lsn=self.checkpoint_lsn
        )
        self.log.append(record)
        self.checkpoint_lsn = lsn

        # Checkpoint flush: synchronize volatile cache to persistent disk
        for page_id, val in self.volatile_buffer_state.items():
            self.persistent_disk_state[page_id] = val

        return lsn

    def simulate_crash(self) -> None:
        """
        Simulates an abrupt power outage / system failure:
        All volatile buffer pool contents are lost. Persistent disk state remains.
        """
        self.volatile_buffer_state.clear()

    def aries_recovery(self) -> Dict[str, Any]:
        """
        Executes ARIES 3-Phase Crash Recovery:
          Phase 1: Analysis - Reconstructs active transactions from the latest checkpoint.
          Phase 2: Redo - Replays all logged changes forward to restore system state to the crash instant.
          Phase 3: Undo - Reverses all uncommitted (loser) transactions to ensure atomicity.
        Returns a recovery summary dictionary.
        """
        redone_lsns: List[int] = []
        undone_lsns: List[int] = []

        # ---------------------------------------------------------------------
        # Phase 1: Analysis
        # ---------------------------------------------------------------------
        active_txs: Set[str] = set()
        start_index = 0

        # Scan for the most recent checkpoint
        for idx, rec in enumerate(self.log):
            if rec.record_type == RecordType.CHECKPOINT:
                self.checkpoint_lsn = rec.lsn
                start_index = idx
                if rec.new_value and "active_txs" in rec.new_value:
                    active_txs = set(rec.new_value["active_txs"])

        # Scan forward from checkpoint to end of log
        for rec in self.log[start_index:]:
            if rec.record_type == RecordType.BEGIN:
                active_txs.add(rec.tx_id)
            elif rec.record_type in (RecordType.COMMIT, RecordType.ABORT):
                active_txs.discard(rec.tx_id)

        loser_transactions = set(active_txs)

        # ---------------------------------------------------------------------
        # Phase 2: Redo (Repeating history)
        # ---------------------------------------------------------------------
        # Start from checkpoint (or beginning of log if no checkpoint exists)
        for rec in self.log[start_index:]:
            if rec.record_type == RecordType.UPDATE and rec.page_id is not None:
                # Replay update into state
                self.persistent_disk_state[rec.page_id] = rec.new_value
                redone_lsns.append(rec.lsn)

        # ---------------------------------------------------------------------
        # Phase 3: Undo (Rolling back losers)
        # ---------------------------------------------------------------------
        # Traverse log in reverse order, rolling back updates of loser transactions
        for rec in reversed(self.log):
            if (
                rec.tx_id in loser_transactions
                and rec.record_type == RecordType.UPDATE
                and not rec.undone
                and rec.page_id is not None
            ):
                # Restore old_value
                self.persistent_disk_state[rec.page_id] = rec.old_value
                rec.undone = True
                undone_lsns.append(rec.lsn)

                # Append Compensation Log Record (CLR)
                clr_lsn = self._next_lsn()
                clr = WALRecord(
                lsn=self._allocate_lsn(),
                tx_id=tx_id,
                record_type=WALRecordType.CLR,
                page_id=victim_rec.page_id,
                prev_lsn=self.last_tx_lsn.get(tx_id, 0),
                undo_next_lsn=victim_rec.prev_lsn,
                old_value=None,
                new_value=victim_rec.old_value,
                flushed_to_disk=True,
                timestamp=time.time()
            )
            self.log_records.append(clr)
            self.last_tx_lsn[tx_id] = clr.lsn
            undone_lsns.append(victim_rec.lsn)

            # Advance the transaction's undo chain
            if victim_rec.prev_lsn != 0:
                undo_active_lsns.add(victim_rec.prev_lsn)
            else:
                # Reached the start of the transaction; append end record
                end_rec = WALRecord(
                    lsn=self._allocate_lsn(),
                    tx_id=tx_id,
                    record_type=WALRecordType.ABORT,
                    page_id=None,
                    prev_lsn=self.last_tx_lsn.get(tx_id, 0),
                    undo_next_lsn=None,
                    old_value=None,
                    new_value=None,
                    flushed_to_disk=True,
                    timestamp=time.time()
                )
                self.log_records.append(end_rec)
                self.last_tx_lsn[tx_id] = end_rec.lsn

        return {
            "redone_lsns": redone_lsns,
            "undone_lsns": undone_lsns,
            "loser_transactions": list(loser_transactions)
        }