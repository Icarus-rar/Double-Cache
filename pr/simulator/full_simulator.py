"""
Full Simulator: Combines all components
This is where double caching happens!
"""

from .disk import Disk
from .database import Database
from .os_cache import OSCache
from .logger import SimulationLogger


class FullSimulator:
    def __init__(
        self,
        db_cache_size,
        os_cache_size,
        total_blocks,
        cache_mode="double_caching"
    ):
        """
        Initialize full simulator

        db_cache_size: database buffer pool size
        os_cache_size: OS page cache size
        total_blocks: total blocks on disk
        cache_mode:
            - "double_caching" : DB and OS cache independently
            - "coordinated"    : removes duplicate OS copy when DB owns block
        """

        self.disk = Disk(total_blocks)
        self.os_cache = OSCache(self.disk, os_cache_size)
        self.database = Database(self.disk, db_cache_size)

        valid_modes = {"double_caching", "coordinated"}

        if cache_mode not in valid_modes:
            raise ValueError(
                f"cache_mode must be one of {valid_modes}"
            )

        self.cache_mode = cache_mode

        self.workload_log = []
        self.duplication_log = []
        self.logger = SimulationLogger()

    def process_workload(self, workload):
        """
        Process a series of block accesses

        workload: list of block IDs to access
        """

        print(f"\n{'=' * 60}")
        print(f"Processing workload ({len(workload)} accesses)")
        print(f"Cache mode: {self.cache_mode}")
        print(f"{'=' * 60}")

        for step, block_id in enumerate(workload):

            print(f"\nStep {step + 1}: Reading block {block_id}")

            # ---------------------------------------------------------
            # Determine whether the current access is sequential
            # ---------------------------------------------------------
            #
            # An access is considered sequential when the current
            # block immediately follows the previous requested block.
            #
            # Example:
            # 10 -> 11 -> 12 -> 13
            #
            # 11, 12 and 13 are sequential accesses.
            #
            # The first access has no previous block, so it is treated
            # as non-sequential.
            # ---------------------------------------------------------

            is_sequential = (
                step > 0
                and workload[step - 1] + 1 == block_id
            )

            if is_sequential:
                print("  Access pattern: SEQUENTIAL")
            else:
                print("  Access pattern: RANDOM/NON-SEQUENTIAL")

            # ---------------------------------------------------------
            # Database processes the query
            #
            # IMPORTANT:
            # Pass is_sequential to Database so that it can pass the
            # information to Disk.read().
            # ---------------------------------------------------------

            data, latency, hit_type = self.database.query(
                block_id,
                self.os_cache,
                is_sequential=is_sequential
            )

            # ---------------------------------------------------------
            # If database had to read from disk, the OS automatically
            # caches the block.
            # ---------------------------------------------------------

            if hit_type == 'disk_read':

                print(
                    f"  Disk read (latency: {latency:.2f}ms)"
                )

                self.os_cache.automatic_cache(
                    block_id,
                    data
                )

                print(
                    f"  OS automatically cached block {block_id}"
                )

            elif hit_type == 'os_hit':

                print(
                    f"  Database missed, but OS had it "
                    f"(latency: {latency:.2f}ms)"
                )

            else:  # db_hit

                print(
                    f"  Database cache HIT "
                    f"(latency: {latency:.2f}ms)"
                )

            # ---------------------------------------------------------
            # Coordinated caching
            #
            # Once the DB owns the block, remove the duplicate copy
            # from the OS cache.
            #
            # Double-caching mode does NOT execute this section.
            # ---------------------------------------------------------

            if self.cache_mode == "coordinated":

                removed = self.os_cache.remove(block_id)

                if removed:
                    print(
                        "  Coordinated caching: "
                        "removed duplicate from OS cache"
                    )

            # ---------------------------------------------------------
            # Get current cache states
            # ---------------------------------------------------------

            db_blocks = self.database.buffer_pool.get_blocks()
            os_blocks = self.os_cache.get_blocks()

            duplicated = (
                set(db_blocks).intersection(
                    set(os_blocks)
                )
            )

            # ---------------------------------------------------------
            # Check for double caching
            # ---------------------------------------------------------

            if duplicated:

                print(
                    f"  ⚠️ DOUBLE CACHING: "
                    f"Blocks {duplicated} in both caches!"
                )

                self.duplication_log.append({
                    'duplicated_blocks': list(duplicated),
                    'count': len(duplicated)
                })

            else:

                print("  No duplication")

            # ---------------------------------------------------------
            # Log this step
            # ---------------------------------------------------------

            self.logger.log_step(
                step=step + 1,
                block_id=block_id,
                hit_type=hit_type,
                latency=latency,
                db_blocks=db_blocks,
                os_blocks=os_blocks,
                duplicated_count=len(duplicated),
                cache_mode=self.cache_mode
            )

    def check_duplication(self):
        """
        Check which blocks are in BOTH caches (the waste!)
        """

        db_blocks = set(
            self.database.buffer_pool.get_blocks()
        )

        os_blocks = set(
            self.os_cache.get_blocks()
        )

        duplicated = db_blocks.intersection(os_blocks)

        if duplicated:

            print(
                f"  ⚠️ DOUBLE CACHING: "
                f"Blocks {duplicated} in both caches!"
            )

            self.duplication_log.append({
                'duplicated_blocks': list(duplicated),
                'count': len(duplicated)
            })

        else:

            print("  No duplication")

        return duplicated

    def print_final_report(self):
        """
        Print final statistics and analysis
        """

        db_blocks = set(
            self.database.buffer_pool.get_blocks()
        )

        os_blocks = set(
            self.os_cache.get_blocks()
        )

        duplicated = db_blocks.intersection(os_blocks)

        print(f"\n\n{'=' * 60}")
        print("FINAL REPORT")
        print(f"{'=' * 60}")

        print(f"\nCache Mode:")
        print(f"  {self.cache_mode}")

        print(f"\nDatabase Cache:")
        print(f"  Blocks: {len(db_blocks)}")
        print(f"  Contents: {sorted(db_blocks)}")

        print(f"\nOS Cache:")
        print(f"  Blocks: {len(os_blocks)}")
        print(f"  Contents: {sorted(os_blocks)}")

        print(f"\nDOUBLE CACHING:")
        print(f"  Duplicated blocks: {len(duplicated)}")
        print(
            f"  Duplicated block IDs: "
            f"{sorted(duplicated)}"
        )

        print(
            f"  Memory wasted: "
            f"{len(duplicated)} blocks × 4KB = "
            f"{len(duplicated) * 4}KB"
        )

        print(f"\nStatistics:")

        self.disk.print_stats()
        self.database.print_stats()
        self.os_cache.print_stats()

        print(f"\n{'=' * 60}")

    def save_results(self, filename=None):
        """
        Save results to CSV
        """

        if filename:
            self.logger.filename = filename

        self.logger.save()

        return self.logger.filename

    def get_summary(self):
        """
        Get summary statistics
        """

        return self.logger.get_summary()