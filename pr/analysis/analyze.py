# analysis/analyze.py
"""
Analyze results from simulations
"""

import csv
import os
from collections import defaultdict

class ResultsAnalyzer:
    def __init__(self, csv_file):
        """Load CSV results"""
        self.data = []
        self.csv_file = csv_file
        self.load_data()
    
    def load_data(self):
        """Load data from CSV"""
        with open(self.csv_file, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Convert numeric fields
                row['step'] = int(row['step'])
                row['block_id'] = int(row['block_id'])
                row['latency_ms'] = float(row['latency_ms'])
                row['db_cache_size'] = int(row['db_cache_size'])
                row['os_cache_size'] = int(row['os_cache_size'])
                row['duplicated_blocks'] = int(row['duplicated_blocks'])
                row['memory_wasted_kb'] = float(row['memory_wasted_kb'])
                
                self.data.append(row)
        
        print(f"Loaded {len(self.data)} records from {os.path.basename(self.csv_file)}")
    
    def get_duplication_over_time(self):
        """Get duplication statistics over time"""
        return [(d['step'], d['duplicated_blocks']) for d in self.data]
    
    def get_latency_over_time(self):
        """Get latency over time"""
        return [(d['step'], d['latency_ms']) for d in self.data]
    
    def get_hit_type_distribution(self):
        """Count how many of each hit type"""
        counts = defaultdict(int)
        for row in self.data:
            counts[row['hit_type']] += 1
        return counts
    
    def get_avg_latency_by_hit_type(self):
        """Average latency for each hit type"""
        hit_types = defaultdict(list)
        for row in self.data:
            hit_types[row['hit_type']].append(row['latency_ms'])
        
        avgs = {}
        for hit_type, latencies in hit_types.items():
            avgs[hit_type] = sum(latencies) / len(latencies)
        
        return avgs
    
    def print_report(self):
        """Print analysis report"""
        print("\n" + "="*70)
        print("ANALYSIS REPORT")
        print("="*70)
        
        # Hit type distribution
        hit_dist = self.get_hit_type_distribution()
        print(f"\nHit Type Distribution:")
        print(f"  DB Hits: {hit_dist.get('db_hit', 0)}")
        print(f"  OS Hits: {hit_dist.get('os_hit', 0)}")
        print(f"  Disk Reads: {hit_dist.get('disk_read', 0)}")
        
        # Average latency by type
        avg_lat = self.get_avg_latency_by_hit_type()
        print(f"\nAverage Latency by Hit Type:")
        for hit_type, latency in avg_lat.items():
            print(f"  {hit_type}: {latency:.2f}ms")
        
        # Duplication statistics
        duplications = [d['duplicated_blocks'] for d in self.data]
        print(f"\nDuplication Statistics:")
        print(f"  Max duplicated blocks: {max(duplications)}")
        print(f"  Min duplicated blocks: {min(duplications)}")
        print(f"  Avg duplicated blocks: {sum(duplications) / len(duplications):.2f}")
        print(f"  Total memory wasted: {max(duplications) * 4}KB")
        
        # Overall statistics
        total_latency = sum([d['latency_ms'] for d in self.data])
        print(f"\nOverall Statistics:")
        print(f"  Total steps: {len(self.data)}")
        print(f"  Total latency: {total_latency:.2f}ms")
        print(f"  Average latency: {total_latency / len(self.data):.2f}ms")
        
        print("="*70)
    
    def export_summary(self, output_file):
        """Export summary as CSV"""
        summary = {
            'file': os.path.basename(self.csv_file),
            'total_steps': len(self.data),
            'db_hits': len([d for d in self.data if d['hit_type'] == 'db_hit']),
            'os_hits': len([d for d in self.data if d['hit_type'] == 'os_hit']),
            'disk_reads': len([d for d in self.data if d['hit_type'] == 'disk_read']),
            'max_duplication': max([d['duplicated_blocks'] for d in self.data]),
            'avg_latency': sum([d['latency_ms'] for d in self.data]) / len(self.data),
            'total_wasted_kb': max([d['duplicated_blocks'] for d in self.data]) * 4,
        }
        
        # Write to CSV
        with open(output_file, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=summary.keys())
            writer.writeheader()
            writer.writerow(summary)
        
        print(f"Summary exported to: {output_file}")

if __name__ == "__main__":
    # Example usage
    analyzer = ResultsAnalyzer("../data/scenario1_results.csv")
    analyzer.print_report()