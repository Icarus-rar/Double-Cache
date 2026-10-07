# simulator/logger.py
"""
Data Logger: Save simulation results to CSV
"""

import csv
from datetime import datetime

class SimulationLogger:
    def __init__(self, filename=None):
        """
        Initialize logger
        
        filename: CSV file to save to
                 If None, creates filename with timestamp
        """
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"simulation_results_{timestamp}.csv"
        
        self.filename = filename
        self.data = []
    
    def log_step(self, step, block_id, hit_type, latency, 
                 db_blocks, os_blocks, duplicated_count, cache_mode="double_caching"):
        """
        Log a single step in the simulation
        
        step: step number
        block_id: which block was accessed
        hit_type: 'db_hit', 'os_hit', or 'disk_read'
        latency: time taken (ms)
        db_blocks: current blocks in DB cache
        os_blocks: current blocks in OS cache
        duplicated_count: how many blocks are in both caches
        """
        self.data.append({
            'step': step,
            'block_id': block_id,
            'hit_type': hit_type,
            'latency_ms': round(latency, 2),
            'db_cache_size': len(db_blocks),
            'os_cache_size': len(os_blocks),
            'duplicated_blocks': duplicated_count,
            'memory_wasted_kb': duplicated_count * 4,
            'cache_mode': cache_mode,
        })
    
    def save(self):
        """Save all logged data to CSV"""
        if not self.data:
            print("No data to save!")
            return
        
        with open(self.filename, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=self.data[0].keys())
            writer.writeheader()
            writer.writerows(self.data)
        
        print(f"\n✓ Data saved to: {self.filename}")
    
    def get_summary(self):
        """Get summary statistics from logged data"""
        if not self.data:
            return None
        
        db_hits = len([d for d in self.data if d['hit_type'] == 'db_hit'])
        os_hits = len([d for d in self.data if d['hit_type'] == 'os_hit'])
        disk_reads = len([d for d in self.data if d['hit_type'] == 'disk_read'])
        
        avg_latency = sum([d['latency_ms'] for d in self.data]) / len(self.data)
        max_duplication = max([d['duplicated_blocks'] for d in self.data])
        total_wasted = sum([d['memory_wasted_kb'] for d in self.data]) / len(self.data)
        
        return {
            'total_steps': len(self.data),
            'db_hits': db_hits,
            'os_hits': os_hits,
            'disk_reads': disk_reads,
            'avg_latency_ms': round(avg_latency, 2),
            'max_duplication': max_duplication,
            'avg_wasted_memory_kb': round(total_wasted, 2),
        }