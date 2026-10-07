import os
import sys
import tkinter as tk
from tkinter import ttk, messagebox

# ============================================================
# PROJECT PATH
# ============================================================

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from simulator.full_simulator import FullSimulator
from simulator.workload import Workload

# ============================================================
# MAIN APPLICATION
# ============================================================

class DoubleCachingGUI:

    def __init__(self, root):

        self.root = root
        self.root.title("Double Caching Simulator")
        self.root.geometry("1500x900")
        self.root.minsize(1200, 750)

        # State variables
        self.simulator = None
        self.workload = []
        self.current_step = 0
        self.running = False
        self.after_id = None

        self.current_scenario = "Scenario 3 - Random"
        self.current_mode = "double_caching"

        # Tk variables
        self.step_var = tk.StringVar(value="Step: 0 / 0")
        self.current_block_var = tk.StringVar(value="-")
        self.result_var = tk.StringVar(value="WAITING")
        self.latency_var = tk.StringVar(value="0.000 ms")
        self.pattern_var = tk.StringVar(value="-")
        self.duplicate_var = tk.StringVar(value="No duplication")

        # Statistics variables
        self.stat_vars = {}

        # Create GUI
        self.create_header()
        self.create_controls()
        self.create_progress()
        self.create_cache_area()
        self.create_statistics()
        self.create_log_area()

        # Initial state
        self.reset_simulation()

    # ========================================================
    # HEADER
    # ========================================================

    def create_header(self):
        frame = ttk.Frame(self.root)
        frame.pack(fill="x", padx=20, pady=(15, 5))

        title = ttk.Label(
            frame,
            text="Double Caching Simulator",
            font=("Segoe UI", 25, "bold")
        )
        title.pack(anchor="w")

        subtitle = ttk.Label(
            frame,
            text="Real-Time DBMS Buffer Pool ↔ OS Page Cache Simulation",
            font=("Segoe UI", 12)
        )
        subtitle.pack(anchor="w", pady=(3, 0))

    # ========================================================
    # CONTROLS
    # ========================================================

    def create_controls(self):
        frame = ttk.LabelFrame(self.root, text="Simulation Controls", padding=12)
        frame.pack(fill="x", padx=20, pady=8)

        # Scenario
        ttk.Label(frame, text="Scenario:").grid(row=0, column=0, padx=(5, 8), pady=5)

        self.scenario_combo = ttk.Combobox(
            frame,
            state="readonly",
            width=30,
            values=[
                "Scenario 1 - Light Load",
                "Scenario 2 - Hotspot Load",
                "Scenario 3 - Random"
            ]
        )
        self.scenario_combo.current(2)
        self.scenario_combo.grid(row=0, column=1, padx=5, pady=5)

        # Speed control
        ttk.Label(frame, text="Speed:").grid(row=0, column=2, padx=(25, 8), pady=5)

        self.speed_combo = ttk.Combobox(
            frame,
            state="readonly",
            width=15,
            values=["Slow (500ms)", "Normal (100ms)", "Fast (50ms)", "Very Fast (10ms)"]
        )
        self.speed_combo.current(1)
        self.speed_combo.grid(row=0, column=3, padx=5, pady=5)

        # Run button
        self.run_button = ttk.Button(
            frame,
            text="▶  Run Simulation",
            command=self.start_simulation
        )
        self.run_button.grid(row=0, column=4, padx=(30, 8), pady=5, ipadx=10)

        # Pause button
        self.pause_button = ttk.Button(
            frame,
            text="Ⅱ  Pause",
            command=self.pause_simulation,
            state="disabled"
        )
        self.pause_button.grid(row=0, column=5, padx=5, pady=5)

        # Reset button
        self.reset_button = ttk.Button(
            frame,
            text="Reset",
            command=self.reset_simulation
        )
        self.reset_button.grid(row=0, column=6, padx=(10, 5), pady=5)

    # ========================================================
    # PROGRESS
    # ========================================================

    def create_progress(self):
        frame = ttk.Frame(self.root)
        frame.pack(fill="x", padx=20, pady=(0, 5))

        ttk.Label(
            frame,
            textvariable=self.step_var,
            font=("Segoe UI", 11, "bold")
        ).pack(side="left", padx=(0, 10))

        self.progress = ttk.Progressbar(
            frame,
            orient="horizontal",
            mode="determinate"
        )
        self.progress.pack(side="left", fill="x", expand=True)

    # ========================================================
    # CACHE AREA
    # ========================================================

    def create_cache_area(self):
        main_frame = ttk.Frame(self.root)
        main_frame.pack(fill="x", padx=20, pady=5)

        # DB Cache
        db_frame = ttk.LabelFrame(main_frame, text="DBMS Buffer Pool", padding=8)
        db_frame.pack(side="left", fill="both", expand=True, padx=(0, 8))

        self.db_cache_text = tk.Text(
            db_frame,
            height=12,
            font=("Consolas", 12),
            state="disabled",
            wrap="none"
        )
        self.db_cache_text.pack(fill="both", expand=True)

        # OS Cache
        os_frame = ttk.LabelFrame(main_frame, text="OS Page Cache", padding=8)
        os_frame.pack(side="left", fill="both", expand=True, padx=(0, 8))

        self.os_cache_text = tk.Text(
            os_frame,
            height=12,
            font=("Consolas", 12),
            state="disabled",
            wrap="none"
        )
        self.os_cache_text.pack(fill="both", expand=True)

        # Info panel
        info_frame = ttk.LabelFrame(main_frame, text="Current Step", padding=8)
        info_frame.pack(side="left", fill="both", expand=True)

        # Current block
        ttk.Label(info_frame, text="Block ID:", font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=(5, 0))
        ttk.Label(info_frame, textvariable=self.current_block_var, font=("Segoe UI", 14, "bold"), foreground="blue").pack(anchor="w")

        # Hit type
        ttk.Label(info_frame, text="Hit Type:", font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=(10, 0))
        self.result_label = ttk.Label(info_frame, textvariable=self.result_var, font=("Segoe UI", 12, "bold"), foreground="green")
        self.result_label.pack(anchor="w")

        # Latency
        ttk.Label(info_frame, text="Latency:", font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=(10, 0))
        ttk.Label(info_frame, textvariable=self.latency_var, font=("Segoe UI", 12, "bold"), foreground="red").pack(anchor="w")

        # Duplication status
        ttk.Label(info_frame, text="Duplication:", font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=(10, 0))
        ttk.Label(info_frame, textvariable=self.duplicate_var, font=("Segoe UI", 11, "bold"), foreground="purple").pack(anchor="w")

    # ========================================================
    # STATISTICS
    # ========================================================

    def create_statistics(self):
        frame = ttk.LabelFrame(self.root, text="Statistics", padding=10)
        frame.pack(fill="x", padx=20, pady=5)

        stat_names = [
            "DB Hits",
            "OS Hits", 
            "Disk Reads",
            "DB Hit Rate",
            "OS Hit Rate",
            "Avg Latency",
            "Wasted Memory",
            "DB Cache Usage",
            "OS Cache Usage",
            "Cache Efficiency",
            "Redundant Memory"
        ]

        for i, name in enumerate(stat_names):
            ttk.Label(frame, text=f"{name}:", font=("Segoe UI", 10)).grid(row=i//4, column=(i%4)*2, sticky="w", padx=5, pady=3)
            
            var = tk.StringVar(value="0")
            self.stat_vars[name] = var
            
            ttk.Label(frame, textvariable=var, font=("Segoe UI", 10, "bold"), foreground="darkblue").grid(row=i//4, column=(i%4)*2+1, sticky="w", padx=5, pady=3)

    # ========================================================
    # LOG AREA
    # ========================================================

    def create_log_area(self):
        frame = ttk.LabelFrame(self.root, text="Simulation Log", padding=8)
        frame.pack(fill="both", expand=True, padx=20, pady=(5, 20))

        self.log_text = tk.Text(
            frame,
            height=10,
            font=("Consolas", 9),
            state="disabled",
            wrap="word"
        )
        self.log_text.pack(fill="both", expand=True)

    # ========================================================
    # MAIN SIMULATION
    # ========================================================

    def start_simulation(self):
        if self.running:
            return

        if self.simulator is None or self.current_step == 0:
            # Initialize new simulation
            scenario = self.scenario_combo.get()
            
            if "Light" in scenario:
                db_size, os_size = 5, 5
                workload = Workload.sequential(10, 0)
            elif "Hotspot" in scenario:
                db_size, os_size = 10, 10
                workload = Workload.hotspot(30, 20, 100)
            else:  # Random
                db_size, os_size = 3, 3
                workload = Workload.random(50, 100)

            self.simulator = FullSimulator(db_size, os_size, 100)
            self.workload = workload
            self.current_step = 0

            self.add_log(f"Started simulation: {scenario}")
            self.add_log(f"DB Cache: {db_size} blocks | OS Cache: {os_size} blocks | Workload: {len(workload)} accesses")
            self.add_log("=" * 90)

        self.running = True
        self.run_button.config(state="disabled")
        self.pause_button.config(state="normal")

        # Get speed
        speed_str = self.speed_combo.get()
        if "Slow" in speed_str:
            step_delay = 500
        elif "Normal" in speed_str:
            step_delay = 100
        elif "Fast" in speed_str:
            step_delay = 50
        else:
            step_delay = 10

        self.step_delay = step_delay
        self.run_simulation_step()

    def run_simulation_step(self):
        if not self.running or self.current_step >= len(self.workload):
            self.finish_simulation()
            return

        # Get the block to read
        block_id = self.workload[self.current_step]

        # Process this block through simulator
        data, latency, hit_type = self.simulator.database.query(block_id, self.simulator.os_cache)

        # If disk read, OS automatically caches
        if hit_type == 'disk_read':
            self.simulator.os_cache.automatic_cache(block_id, data)

        # Get cache states
        db_blocks = set(self.simulator.database.buffer_pool.get_blocks())
        os_blocks = set(self.simulator.os_cache.get_blocks())
        duplicated = db_blocks.intersection(os_blocks)

        # Log this step to CSV
        self.simulator.logger.log_step(
            step=self.current_step + 1,
            block_id=block_id,
            hit_type=hit_type,
            latency=latency,
            db_blocks=list(db_blocks),
            os_blocks=list(os_blocks),
            duplicated_count=len(duplicated)
        )

        # Update GUI
        self.current_step += 1
        self.update_display(block_id, hit_type, latency, db_blocks, os_blocks, duplicated)
        self.update_statistics()

        # Schedule next step
        self.after_id = self.root.after(self.step_delay, self.run_simulation_step)

    def update_display(self, block_id, hit_type, latency, db_blocks, os_blocks, duplicated):
        # Update step counter
        self.step_var.set(f"Step: {self.current_step} / {len(self.workload)}")
        self.progress["value"] = self.current_step
        self.progress["maximum"] = len(self.workload)

        # Current block
        self.current_block_var.set(str(block_id))

        # Hit type
        if hit_type == 'db_hit':
            self.result_var.set("DB CACHE HIT ✓")
            self.result_label.config(foreground="green")
        elif hit_type == 'os_hit':
            self.result_var.set("OS CACHE HIT")
            self.result_label.config(foreground="orange")
        else:
            self.result_var.set("DISK READ")
            self.result_label.config(foreground="red")

        # Latency
        self.latency_var.set(f"{latency:.3f} ms")

        # Duplication
        if duplicated:
            self.duplicate_var.set(f"⚠ {len(duplicated)} blocks duplicated")
        else:
            self.duplicate_var.set("No duplication")

        # Cache displays
        self.update_cache_display(self.db_cache_text, sorted(db_blocks), duplicated)
        self.update_cache_display(self.os_cache_text, sorted(os_blocks), duplicated)

        # Log
        self.add_log(f"Step {self.current_step}: Block {block_id} → {hit_type.upper()} ({latency:.2f}ms) | Duplicated: {len(duplicated)}")

    def update_cache_display(self, widget, blocks, duplicated):
        widget.config(state="normal")
        widget.delete("1.0", "end")

        for block in blocks:
            if block in duplicated:
                widget.insert("end", f"[{block}] ⚠\n", "dup")
            else:
                widget.insert("end", f"[{block}]\n")

        widget.tag_config("dup", foreground="red", background="yellow")
        widget.config(state="disabled")

    def update_statistics(self):
        if not self.simulator:
            return

        db_pool = self.simulator.database.buffer_pool
        os_pool = self.simulator.os_cache.page_cache

        db_blocks = set(db_pool.get_blocks())
        os_blocks = set(os_pool.get_blocks())
        duplicated = db_blocks.intersection(os_blocks)

        # Calculate stats
        db_hits = db_pool.stats['hits']
        os_hits = os_pool.stats['hits']
        disk_reads = self.simulator.disk.stats['total_reads']
        
        db_hit_rate = db_pool.hit_rate()
        os_hit_rate = os_pool.hit_rate()
        
        avg_latency = self.simulator.database.stats['total_latency'] / max(1, self.simulator.database.stats['queries'])
        
        wasted_memory = len(duplicated) * 4
        db_usage = (len(db_blocks) / db_pool.max_blocks * 100) if db_pool.max_blocks > 0 else 0
        os_usage = (len(os_blocks) / os_pool.max_blocks * 100) if os_pool.max_blocks > 0 else 0
        
        # Update displays
        self.stat_vars["DB Hits"].set(str(db_hits))
        self.stat_vars["OS Hits"].set(str(os_hits))
        self.stat_vars["Disk Reads"].set(str(disk_reads))
        self.stat_vars["DB Hit Rate"].set(f"{db_hit_rate:.1f}%")
        self.stat_vars["OS Hit Rate"].set(f"{os_hit_rate:.1f}%")
        self.stat_vars["Avg Latency"].set(f"{avg_latency:.3f} ms")
        self.stat_vars["Wasted Memory"].set(f"{wasted_memory} KB")
        self.stat_vars["DB Cache Usage"].set(f"{db_usage:.1f}%")
        self.stat_vars["OS Cache Usage"].set(f"{os_usage:.1f}%")
        self.stat_vars["Redundant Memory"].set(f"{len(duplicated)} blocks")

    def add_log(self, message):
        self.log_text.config(state="normal")
        self.log_text.insert("end", message + "\n")
        self.log_text.see("end")
        self.log_text.config(state="disabled")
        self.root.update()

    def pause_simulation(self):
        if not self.running:
            return

        self.running = False

        if self.after_id is not None:
            try:
                self.root.after_cancel(self.after_id)
            except:
                pass
            self.after_id = None

        self.run_button.config(state="normal", text="▶  Resume Simulation")
        self.pause_button.config(state="disabled")
        self.add_log("")
        self.add_log("⏸ SIMULATION PAUSED")
        self.add_log(f"Paused at step {self.current_step} / {len(self.workload)}")
        self.add_log("")

    def finish_simulation(self):
        self.running = False
        self.after_id = None
        self.run_button.config(state="normal", text="▶  Run Simulation")
        self.pause_button.config(state="disabled")

        self.add_log("")
        self.add_log("=" * 90)
        self.add_log("✓ SIMULATION COMPLETE")
        self.add_log("=" * 90)

        # Final stats
        db_blocks = set(self.simulator.database.buffer_pool.get_blocks())
        os_blocks = set(self.simulator.os_cache.get_blocks())
        duplicated = db_blocks.intersection(os_blocks)

        self.add_log(f"Final DB Cache   : {sorted(db_blocks)}")
        self.add_log(f"Final OS Cache   : {sorted(os_blocks)}")
        self.add_log(f"Final Duplicates : {sorted(duplicated)}")
        self.add_log(f"Final Memory Waste: {len(duplicated) * 4} KB")
        self.add_log("=" * 90)

        # Save CSV
        try:
            data_dir = os.path.join(PROJECT_ROOT, "data")
            os.makedirs(data_dir, exist_ok=True)

            scenario_name = self.scenario_combo.get().split(" - ")[0].lower().replace(" ", "")
            filename = f"{scenario_name}_gui.csv"
            output_file = os.path.join(data_dir, filename)

            self.simulator.save_results(output_file)
            self.add_log(f"✓ CSV saved: {filename}")

        except Exception as error:
            self.add_log(f"⚠ Could not save CSV: {error}")

    def reset_simulation(self):
        if self.after_id is not None:
            try:
                self.root.after_cancel(self.after_id)
            except:
                pass
            self.after_id = None

        self.running = False
        self.simulator = None
        self.workload = []
        self.current_step = 0

        self.step_var.set("Step: 0 / 0")
        self.progress["value"] = 0
        self.progress["maximum"] = 1
        self.current_block_var.set("-")
        self.result_var.set("WAITING")
        self.latency_var.set("0.000 ms")
        self.duplicate_var.set("No duplication")
        self.result_label.config(foreground="black")

        self.db_cache_text.config(state="normal")
        self.db_cache_text.delete("1.0", "end")
        self.db_cache_text.insert("end", "(empty)\n")
        self.db_cache_text.config(state="disabled")

        self.os_cache_text.config(state="normal")
        self.os_cache_text.delete("1.0", "end")
        self.os_cache_text.insert("end", "(empty)\n")
        self.os_cache_text.config(state="disabled")

        for variable in self.stat_vars.values():
            variable.set("0")

        self.log_text.config(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.config(state="disabled")

        self.run_button.config(state="normal", text="▶  Run Simulation")
        self.pause_button.config(state="disabled")

# ============================================================
# APPLICATION ENTRY POINT
# ============================================================

def main():
    root = tk.Tk()
    app = DoubleCachingGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()