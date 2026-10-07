# simulator/cache.py
"""
Generic LRU Cache: Used by both Database and OS
"""

class LRUCache:
    def __init__(self, size_blocks, cache_name="Cache"):
        """
        Initialize LRU cache
        
        size_blocks: how many 4KB blocks this cache can hold
        cache_name: name for logging (e.g., "DB Cache", "OS Cache")
        """
        self.max_blocks = size_blocks
        self.cache = {}  # block_id -> data
        self.order = []  # Track LRU order
        self.cache_name = cache_name
        
        self.stats = {
            'hits': 0,
            'misses': 0,
            'evictions': 0
        }
    
    def get(self, block_id):
        """
        Get a block from cache
        Returns: (found: bool, data: str or None)
        """
        if block_id in self.cache:
            # Cache hit: move to end (most recently used)
            self.order.remove(block_id)
            self.order.append(block_id)
            self.stats['hits'] += 1
            return True, self.cache[block_id]
        else:
            # Cache miss
            self.stats['misses'] += 1
            return False, None
    
    def put(self, block_id, data):
        """
        Put a block into cache
        If full, evict least recently used
        """
        if block_id in self.cache:
            # Block already there, just update order
            self.order.remove(block_id)
            self.order.append(block_id)
            self.cache[block_id] = data
        else:
            # New block
            if len(self.cache) >= self.max_blocks:
                # Cache full, evict LRU
                lru_block = self.order.pop(0)
                del self.cache[lru_block]
                self.stats['evictions'] += 1
            
            # Add new block
            self.cache[block_id] = data
            self.order.append(block_id)
    
    def contains(self, block_id):
        """Check if block is in cache"""
        return block_id in self.cache

    def remove(self, block_id):
        """Remove a block from cache if present."""
        if block_id not in self.cache:
            return False
        del self.cache[block_id]
        self.order.remove(block_id)
        return True
    
    def get_blocks(self):
        """Get list of all block IDs in cache"""
        return list(self.cache.keys())
    
    def get_size(self):
        """Get number of blocks currently in cache"""
        return len(self.cache)
    
    def hit_rate(self):
        """Calculate hit rate percentage"""
        total = self.stats['hits'] + self.stats['misses']
        if total == 0:
            return 0.0
        return (self.stats['hits'] / total) * 100

    def print_stats(self):
        """Print cache statistics"""
        print(f"\n--- {self.cache_name} Statistics ---")
        print(f"Capacity: {self.max_blocks} blocks")
        print(f"Current size: {self.get_size()} blocks")
        print(f"Hits: {self.stats['hits']}")
        print(f"Misses: {self.stats['misses']}")
        print(f"Evictions: {self.stats['evictions']}")
        print(f"Hit rate: {self.hit_rate():.2f}%")
        print(f"Contents: {self.get_blocks()}")