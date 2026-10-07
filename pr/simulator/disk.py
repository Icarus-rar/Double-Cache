# simulator/disk.py
"""
Disk Model: Simulates physical disk storage with realistic latency
"""

class Disk:
    def __init__(self, total_blocks=10000):
        """
        Initialize disk
        
        total_blocks: number of 4KB blocks on disk
        """
        self.total_blocks = total_blocks
        self.data = {}  # block_id -> data
        self.stats = {
            'total_reads': 0,
            'sequential_reads': 0,
            'random_reads': 0
        }
        
        # Initialize disk with some data
        for block_id in range(total_blocks):
            self.data[block_id] = f"data_block_{block_id}"
    
    def read(self, block_id, is_sequential=False):
        """
        Read a block from disk
        
        block_id: which block to read
        is_sequential: whether this is sequential access (faster)
        
        Returns:
        - data: the block data
        - latency: time taken (in simulated milliseconds)
        """
        if block_id not in self.data:
            raise ValueError(f"Block {block_id} does not exist")
        
        self.stats['total_reads'] += 1
        
        # Simulate latency
        if is_sequential:
            latency = 0.1  # Sequential: ~0.1ms per block
            self.stats['sequential_reads'] += 1
        else:
            latency = 10.0  # Random: ~10ms (seek + rotation delay)
            self.stats['random_reads'] += 1
        
        return self.data[block_id], latency
    
    def get_block(self, block_id):
        """Direct access to block data (for simulation)"""
        return self.data[block_id]
    
    def print_stats(self):
        """Print disk statistics"""
        print("\n--- Disk Statistics ---")
        print(f"Total reads: {self.stats['total_reads']}")
        print(f"Sequential reads: {self.stats['sequential_reads']}")
        print(f"Random reads: {self.stats['random_reads']}")