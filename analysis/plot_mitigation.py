"""
Create presentation-ready charts for the mitigation comparison.

Outputs:
    data/graphs/
        01_average_latency.png
        01_average_latency.svg

        02_disk_reads.png
        02_disk_reads.svg

        03_duplication.png
        03_duplication.svg

        04_memory_waste.png
        04_memory_waste.svg

        scenario1_duplication_over_time.png
        scenario1_duplication_over_time.svg

        scenario2_duplication_over_time.png
        scenario2_duplication_over_time.svg

        scenario3_duplication_over_time.png
        scenario3_duplication_over_time.svg
"""

import csv
import os
from collections import defaultdict

import matplotlib.pyplot as plt


# ============================================================
# PATHS
# ============================================================

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
OUTPUT_DIR = os.path.join(DATA_DIR, "graphs")
SUMMARY_FILE = os.path.join(DATA_DIR, "mitigation_summary.csv")


# ============================================================
# DATA LOADING
# ============================================================

def load_summary():
    """Load mitigation summary CSV."""
    with open(SUMMARY_FILE, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def grouped(rows, metric):
    """
    Convert summary rows into:

        {
            scenario1: {
                double_caching: value,
                coordinated: value
            },
            ...
        }
    """
    result = defaultdict(dict)

    for row in rows:
        result[row["scenario"]][row["strategy"]] = float(row[metric])

    return result


def scenario_sort_key(name):
    """Sort scenario1, scenario2, scenario3 numerically."""
    try:
        return int(name.replace("scenario", ""))
    except ValueError:
        return name


# ============================================================
# GRAPH HELPERS
# ============================================================

def scenario_label(name):
    """Convert scenario1 -> Scenario 1."""
    return name.replace("scenario", "Scenario ")


def save_figure(fig, filename):
    """
    Save both PNG and SVG.

    PNG  -> reports / general use
    SVG  -> PowerPoint / Illustrator / high-quality editing
    """
    png_path = os.path.join(OUTPUT_DIR, filename + ".png")
    svg_path = os.path.join(OUTPUT_DIR, filename + ".svg")

    fig.savefig(
        png_path,
        dpi=300,
        bbox_inches="tight",
        facecolor="white",
    )

    fig.savefig(
        svg_path,
        bbox_inches="tight",
        facecolor="white",
    )

    plt.close(fig)


def prepare_axes(ax):
    """Apply clean presentation-oriented axis formatting."""
    ax.grid(
        axis="y",
        alpha=0.20,
        linewidth=0.8,
    )

    ax.set_axisbelow(True)

    # Remove unnecessary top/right borders.
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    # Slightly stronger remaining borders.
    ax.spines["left"].set_linewidth(1.0)
    ax.spines["bottom"].set_linewidth(1.0)

    ax.tick_params(
        axis="both",
        labelsize=11,
        length=5,
    )


def add_value_label(
    ax,
    bar,
    value,
    integer=False,
    zero_offset=0.20,
):
    """Add a clean value label above a bar."""

    if integer:
        text = f"{value:.0f}"
    else:
        text = f"{value:.2f}"

    height = bar.get_height()

    # Zero-height bars need special treatment so the label
    # doesn't disappear on the x-axis.
    if abs(value) < 1e-12:
        y = zero_offset
    else:
        y = height + max(abs(height) * 0.025, 0.05)

    ax.text(
        bar.get_x() + bar.get_width() / 2,
        y,
        text,
        ha="center",
        va="bottom",
        fontsize=11,
        fontweight="bold",
    )


def add_improvement_annotation(
    ax,
    baseline,
    coordinated,
    x_position,
):
    """
    Add an improvement annotation above each scenario.

    Examples:
        100% reduction
        No change
    """

    if baseline == 0:
        return

    reduction = ((baseline - coordinated) / baseline) * 100

    if abs(reduction) < 0.01:
        text = "No change"
    elif reduction > 0:
        text = f"{reduction:.0f}% reduction"
    else:
        text = f"{abs(reduction):.0f}% increase"

    ymax = ax.get_ylim()[1]

    ax.text(
        x_position,
        ymax * 0.94,
        text,
        ha="center",
        va="top",
        fontsize=10,
        fontweight="bold",
    )


# ============================================================
# BAR CHART
# ============================================================

def make_bar(
    rows,
    metric,
    ylabel,
    title,
    filename,
    integer=False,
    subtitle=None,
):
    """Create a polished baseline-vs-solution comparison."""

    data = grouped(rows, metric)

    scenarios = sorted(
        data.keys(),
        key=scenario_sort_key,
    )

    baseline = [
        data[s].get("double_caching", 0)
        for s in scenarios
    ]

    coordinated = [
        data[s].get("coordinated", 0)
        for s in scenarios
    ]

    positions = list(range(len(scenarios)))

    # Wider figure for presentations.
    fig, ax = plt.subplots(
        figsize=(12, 7),
    )

    width = 0.32

    baseline_positions = [
        x - width / 2
        for x in positions
    ]

    coordinated_positions = [
        x + width / 2
        for x in positions
    ]

    bars_baseline = ax.bar(
        baseline_positions,
        baseline,
        width=width,
        label="Baseline: Double Caching",
        alpha=0.90,
    )

    bars_solution = ax.bar(
        coordinated_positions,
        coordinated,
        width=width,
        label="Solution: Coordinated Caching",
        alpha=0.90,
    )

    # --------------------------------------------------------
    # X AXIS
    # --------------------------------------------------------

    ax.set_xticks(positions)

    ax.set_xticklabels(
        [scenario_label(s) for s in scenarios],
        fontsize=12,
        fontweight="bold",
    )

    # --------------------------------------------------------
    # Y AXIS
    # --------------------------------------------------------

    ax.set_ylabel(
        ylabel,
        fontsize=13,
        fontweight="bold",
    )

    # Give zero-valued solution bars some visual room.
    maximum = max(
        max(baseline, default=0),
        max(coordinated, default=0),
        1,
    )

    ax.set_ylim(
        0,
        maximum * 1.20,
    )

    # --------------------------------------------------------
    # TITLE
    # --------------------------------------------------------

    ax.set_title(
        title,
        fontsize=19,
        fontweight="bold",
        pad=18,
    )

    if subtitle:
        ax.text(
            0.5,
            1.01,
            subtitle,
            transform=ax.transAxes,
            ha="center",
            va="bottom",
            fontsize=10.5,
        )

    # --------------------------------------------------------
    # VALUE LABELS
    # --------------------------------------------------------

    for bar, value in zip(
        bars_baseline,
        baseline,
    ):
        add_value_label(
            ax,
            bar,
            value,
            integer=integer,
            zero_offset=0.15,
        )

    for bar, value in zip(
        bars_solution,
        coordinated,
    ):
        add_value_label(
            ax,
            bar,
            value,
            integer=integer,
            zero_offset=0.15,
        )

    # --------------------------------------------------------
    # IMPROVEMENT LABELS
    # --------------------------------------------------------

    for i, (base, solution) in enumerate(
        zip(baseline, coordinated)
    ):
        add_improvement_annotation(
            ax,
            base,
            solution,
            i,
        )

    # --------------------------------------------------------
    # LEGEND
    # --------------------------------------------------------

    ax.legend(
        loc="upper right",
        frameon=True,
        fontsize=10.5,
        fancybox=True,
    )

    prepare_axes(ax)

    fig.tight_layout()

    save_figure(
        fig,
        filename,
    )


# ============================================================
# DUPLICATION OVER TIME
# ============================================================

def duplication_over_time():
    """
    Create one time-series graph for each scenario.
    """

    files = [
        (
            "scenario1",
            "scenario1_double_caching.csv",
            "scenario1_coordinated.csv",
        ),
        (
            "scenario2",
            "scenario2_double_caching.csv",
            "scenario2_coordinated.csv",
        ),
        (
            "scenario3",
            "scenario3_double_caching.csv",
            "scenario3_coordinated.csv",
        ),
    ]

    for scenario, baseline_file, solution_file in files:

        fig, ax = plt.subplots(
            figsize=(12, 7),
        )

        datasets = [
            (
                "Baseline: Double Caching",
                baseline_file,
                "-",
            ),
            (
                "Solution: Coordinated Caching",
                solution_file,
                "--",
            ),
        ]

        all_duplication = []

        # ----------------------------------------------------
        # PLOT BOTH DATASETS
        # ----------------------------------------------------

        for label, filename, linestyle in datasets:

            path = os.path.join(
                DATA_DIR,
                filename,
            )

            with open(
                path,
                newline="",
                encoding="utf-8",
            ) as f:
                rows = list(csv.DictReader(f))

            steps = [
                int(r["step"])
                for r in rows
            ]

            duplication = [
                int(r["duplicated_blocks"])
                for r in rows
            ]

            all_duplication.extend(
                duplication
            )

            ax.plot(
                steps,
                duplication,
                linewidth=3,
                linestyle=linestyle,
                marker="o",
                markersize=5,
                label=label,
            )

        # ----------------------------------------------------
        # AXES
        # ----------------------------------------------------

        ax.set_xlabel(
            "Access Step",
            fontsize=13,
            fontweight="bold",
        )

        ax.set_ylabel(
            "Duplicated Blocks",
            fontsize=13,
            fontweight="bold",
        )

        # Make zero line clearly visible.
        maximum = max(
            all_duplication,
            default=1,
        )

        ax.set_ylim(
            -0.25,
            maximum * 1.20,
        )

        # ----------------------------------------------------
        # TITLE
        # ----------------------------------------------------

        ax.set_title(
            f"{scenario_label(scenario)} — Duplicate Blocks Over Time",
            fontsize=19,
            fontweight="bold",
            pad=18,
        )

        ax.text(
            0.5,
            1.01,
            "Coordinated caching maintains zero memory overlap",
            transform=ax.transAxes,
            ha="center",
            va="bottom",
            fontsize=10.5,
        )

        # ----------------------------------------------------
        # ZERO REFERENCE LINE
        # ----------------------------------------------------

        ax.axhline(
            0,
            linewidth=1.2,
            alpha=0.45,
        )

        # ----------------------------------------------------
        # LEGEND
        # ----------------------------------------------------

        ax.legend(
            loc="upper right",
            fontsize=10.5,
            frameon=True,
            fancybox=True,
        )

        prepare_axes(ax)

        # Keep vertical grid subtle.
        ax.grid(
            axis="x",
            alpha=0.10,
            linewidth=0.7,
        )

        fig.tight_layout()

        save_figure(
            fig,
            f"{scenario}_duplication_over_time",
        )


# ============================================================
# SUMMARY GRAPH
# ============================================================

def make_memory_savings_chart(rows):
    """
    Additional presentation graph showing the percentage
    of duplicated memory eliminated by coordinated caching.
    """

    duplication = grouped(
        rows,
        "max_duplication",
    )

    scenarios = sorted(
        duplication.keys(),
        key=scenario_sort_key,
    )

    savings = []

    for scenario in scenarios:

        baseline = duplication[scenario].get(
            "double_caching",
            0,
        )

        solution = duplication[scenario].get(
            "coordinated",
            0,
        )

        if baseline == 0:
            savings.append(0)
        else:
            savings.append(
                ((baseline - solution) / baseline)
                * 100
            )

    fig, ax = plt.subplots(
        figsize=(12, 7),
    )

    bars = ax.bar(
        range(len(scenarios)),
        savings,
        width=0.50,
        alpha=0.90,
    )

    ax.set_xticks(
        range(len(scenarios))
    )

    ax.set_xticklabels(
        [
            scenario_label(s)
            for s in scenarios
        ],
        fontsize=12,
        fontweight="bold",
    )

    ax.set_ylabel(
        "Memory Duplication Eliminated (%)",
        fontsize=13,
        fontweight="bold",
    )

    ax.set_ylim(
        0,
        110,
    )

    ax.set_title(
        "Memory Efficiency Improvement",
        fontsize=19,
        fontweight="bold",
        pad=18,
    )

    ax.text(
        0.5,
        1.01,
        "Coordinated caching eliminates redundant copies between cache layers",
        transform=ax.transAxes,
        ha="center",
        va="bottom",
        fontsize=10.5,
    )

    for bar, value in zip(
        bars,
        savings,
    ):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            value + 3,
            f"{value:.0f}%",
            ha="center",
            va="bottom",
            fontsize=13,
            fontweight="bold",
        )

    prepare_axes(ax)

    fig.tight_layout()

    save_figure(
        fig,
        "05_memory_efficiency_improvement",
    )


# ============================================================
# MAIN
# ============================================================

def main():

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True,
    )

    rows = load_summary()

    # --------------------------------------------------------
    # 1. LATENCY
    # --------------------------------------------------------

    make_bar(
        rows,
        "avg_latency_ms",
        "Average Latency (ms)",
        "Average Access Latency",
        "01_average_latency",
        integer=False,
        subtitle="Performance remains unchanged while redundant memory usage is eliminated",
    )

    # --------------------------------------------------------
    # 2. DISK READS
    # --------------------------------------------------------

    make_bar(
        rows,
        "disk_reads",
        "Disk Reads",
        "Disk I/O Comparison",
        "02_disk_reads",
        integer=True,
        subtitle="Coordinated caching focuses on memory efficiency, not disk I/O reduction",
    )

    # --------------------------------------------------------
    # 3. MAX DUPLICATION
    # --------------------------------------------------------

    make_bar(
        rows,
        "max_duplication",
        "Maximum Duplicated Blocks",
        "Maximum Cache Duplication",
        "03_duplication",
        integer=True,
        subtitle="Coordinated caching eliminates overlap between the database and OS caches",
    )

    # --------------------------------------------------------
    # 4. MEMORY WASTE
    # --------------------------------------------------------

    make_bar(
        rows,
        "avg_wasted_memory_kb",
        "Average Wasted Memory (KB)",
        "Redundant Memory Usage",
        "04_memory_waste",
        integer=False,
        subtitle="Duplicate blocks consume memory twice in the baseline design",
    )

    # --------------------------------------------------------
    # 5. MEMORY EFFICIENCY
    # --------------------------------------------------------

    make_memory_savings_chart(rows)

    # --------------------------------------------------------
    # 6–8. DUPLICATION OVER TIME
    # --------------------------------------------------------

    duplication_over_time()

    # --------------------------------------------------------
    # DONE
    # --------------------------------------------------------

    print()
    print("=" * 60)
    print("PRESENTATION-READY GRAPHS GENERATED")
    print("=" * 60)
    print()
    print(f"Output directory:")
    print(f"  {OUTPUT_DIR}")
    print()
    print("Generated PNG + SVG files:")
    print("  01_average_latency")
    print("  02_disk_reads")
    print("  03_duplication")
    print("  04_memory_waste")
    print("  05_memory_efficiency_improvement")
    print("  scenario1_duplication_over_time")
    print("  scenario2_duplication_over_time")
    print("  scenario3_duplication_over_time")
    print()
    print("=" * 60)


if __name__ == "__main__":
    main()