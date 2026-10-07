# simulator/os_cache.py
"""
OS Page Cache Simulator: Automatic caching by operating system
"""

from .cache import LRUCache

class OSCache:
    def __init__(self, disk, cache_size=100):
        """
        Initialize OS page cache
        
        disk: Disk object
        cache_size: number of blocks OS can cache
        """
        self.disk = disk
        self.page_cache = LRUCache(cache_size, "OS Page Cache")
        self.stats = {
            'automatic_caches': 0
        }
    
    def automatic_cache(self, block_id, data):
        """
        OS automatically caches after disk read
        (This is called by Database when it reads from disk)
        """
        self.page_cache.put(block_id, data)
        self.stats['automatic_caches'] += 1
    
    def get(self, block_id):
        """
        Check if block is in OS cache
        Returns: (found: bool, data: str or None)
        """
        return self.page_cache.get(block_id)
    
    def contains(self, block_id):
        """Check if block is in cache"""
        return self.page_cache.contains(block_id)

    def remove(self, block_id):
        """Remove a block from the OS page cache if present."""
        return self.page_cache.remove(block_id)
    
    def get_blocks(self):
        """Get list of blocks in OS cache"""
        return self.page_cache.get_blocks()
    
    def print_stats(self):
        """Print OS cache statistics"""
        print("\n--- OS Cache Statistics ---")
        print(f"Automatic caches: {self.stats['automatic_caches']}")
        self.page_cache.print_stats()