"""
Database Simulator: Simulates a database with buffer pool
"""

from .cache import LRUCache


class Database:
    def __init__(self, disk, buffer_pool_size=100):
        """
        Initialize database

        disk: Disk object
        buffer_pool_size: number of blocks database can cache
        """
        self.disk = disk
        self.buffer_pool = LRUCache(
            buffer_pool_size,
            "Database Buffer Pool"
        )

        self.stats = {
            'queries': 0,
            'total_latency': 0.0
        }

    def query(self, block_id, os_cache=None, is_sequential=False):
        """
        Execute a query that reads a block

        block_id: which block to read
        os_cache: OS cache object (for checking if OS has it)
        is_sequential: whether the access is sequential

        Returns:
        - data: the block data
        - latency: time taken (ms)
        - hit_type: 'db_hit', 'os_hit', 'disk_read'
        """

        self.stats['queries'] += 1

        # ---------------------------------------------------------
        # Step 1: Check database buffer pool
        # ---------------------------------------------------------

        found, data = self.buffer_pool.get(block_id)

        if found:
            latency = 0.001

            self.stats['total_latency'] += latency

            return data, latency, 'db_hit'

        # ---------------------------------------------------------
        # Step 2: Check OS cache (if available)
        # ---------------------------------------------------------

        if os_cache:

            found, os_data = os_cache.get(block_id)

            if found:
                # OS has it, but DB missed.
                data = os_data
                latency = 0.1
                hit_type = 'os_hit'

            else:
                # Neither cache has the block.
                # Read it from disk.
                data, disk_latency = self.disk.read(
                    block_id,
                    is_sequential=is_sequential
                )

                latency = disk_latency
                hit_type = 'disk_read'

        else:

            # No OS cache available.
            # Read directly from disk.
            data, disk_latency = self.disk.read(
                block_id,
                is_sequential=is_sequential
            )

            latency = disk_latency
            hit_type = 'disk_read'

        # ---------------------------------------------------------
        # Step 3: Database caches this block
        # ---------------------------------------------------------

        self.buffer_pool.put(
            block_id,
            data
        )

        # ---------------------------------------------------------
        # Update statistics
        # ---------------------------------------------------------

        self.stats['total_latency'] += latency

        return data, latency, hit_type

    def print_stats(self):
        """Print database statistics"""

        print("\n--- Database Statistics ---")

        print(
            f"Total queries: "
            f"{self.stats['queries']}"
        )

        print(
            f"Average latency: "
            f"{self.stats['total_latency'] / max(1, self.stats['queries']):.2f}ms"
        )

        self.buffer_pool.print_stats()