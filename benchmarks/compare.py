#!/usr/bin/env python3
"""
Compare sqlglot (Python) vs sqlglot-ts (TypeScript) benchmark results.

Usage:
    python benchmarks/compare.py                  # run both, print table
    python benchmarks/compare.py --json           # output raw JSON
    python benchmarks/compare.py --markdown       # output GitHub-flavored markdown
"""

import argparse
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BENCH_DIR = os.path.join(ROOT, "benchmarks")
TS_DIR = os.path.join(ROOT, "sqlglot-ts")
TS_RESULTS_PATH = os.path.join(BENCH_DIR, ".bench_ts_results.json")


def run_python_benchmarks():
    """Run Python benchmarks and return results dict."""
    print("Running Python benchmarks...", file=sys.stderr)
    result = subprocess.run(
        [sys.executable, "-m", "benchmarks.bench_py"],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    if result.returncode != 0:
        print(f"Python benchmark failed:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)
    return json.loads(result.stdout)


def run_ts_benchmarks():
    """Run TypeScript benchmarks via vitest bench and return results dict."""
    print("Running TypeScript benchmarks...", file=sys.stderr)

    result = subprocess.run(
        [
            "npx",
            "vitest",
            "bench",
            "--run",
            "benchmarks/bench.bench.ts",
            "--outputJson",
            TS_RESULTS_PATH,
        ],
        capture_output=True,
        text=True,
        cwd=TS_DIR,
    )
    if result.returncode != 0:
        print(f"TypeScript benchmark output:\n{result.stdout}", file=sys.stderr)
        print(f"TypeScript benchmark stderr:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)

    with open(TS_RESULTS_PATH) as f:
        raw = json.load(f)

    # Parse vitest bench JSON output into our normalized format.
    # vitest outputs: { files: [{ groups: [{ fullName, benchmarks: [{ name, mean, ... }] }] }] }
    ts_results = {}
    for file_entry in raw.get("files", []):
        for group in file_entry.get("groups", []):
            full_name = group.get("fullName", "")
            # Extract group name: "benchmarks/bench.bench.ts > parse" → "parse"
            group_name = full_name.split(" > ")[-1] if " > " in full_name else full_name
            for bm in group.get("benchmarks", []):
                task_name = bm.get("name", "")
                sample_count = bm.get("sampleCount", 0)
                if sample_count == 0:
                    continue
                key = f"{group_name} > {task_name}"
                # vitest bench reports times in ms
                mean_ms = bm.get("mean", 0)
                ts_results[key] = {
                    "mean": mean_ms / 1000,  # ms → seconds
                    "median": bm.get("median", mean_ms) / 1000,
                    "min": bm.get("min", mean_ms) / 1000,
                    "max": bm.get("max", mean_ms) / 1000,
                    "stddev": bm.get("sd", 0) / 1000,
                    "samples": sample_count,
                    "hz": bm.get("hz", 0),
                }

    # Clean up temp file
    try:
        os.remove(TS_RESULTS_PATH)
    except OSError:
        pass

    return ts_results


def format_time(seconds):
    """Format seconds into a human-readable string."""
    if seconds < 0.001:
        return f"{seconds * 1_000_000:.1f} us"
    if seconds < 1:
        return f"{seconds * 1_000:.2f} ms"
    return f"{seconds:.3f} s"


def ratio_indicator(ratio):
    """Return a visual indicator for the speed ratio (Python/TS)."""
    if ratio >= 2.0:
        return "TS 2x+ faster"
    if ratio >= 1.1:
        return f"TS {ratio:.1f}x faster"
    if ratio >= 0.91:
        return "~same"
    if ratio >= 0.5:
        return f"Py {1/ratio:.1f}x faster"
    return "Py 2x+ faster"


def print_table(py_results, ts_results):
    """Print a formatted comparison table."""
    # Collect all benchmark names (union of both)
    all_keys = sorted(set(list(py_results.keys()) + list(ts_results.keys())))

    # Group by category
    categories = {}
    for key in all_keys:
        cat = key.split(" > ")[0] if " > " in key else "other"
        categories.setdefault(cat, []).append(key)

    header = f"{'Benchmark':<35} {'Python':>12} {'TypeScript':>12} {'Ratio (Py/TS)':>15} {'Result':>18}"
    sep = "-" * len(header)

    print()
    print("=" * len(header))
    print("  sqlglot (Python) vs sqlglot-ts (TypeScript) Benchmark Comparison")
    print("=" * len(header))
    print()

    for cat in ("parse", "generate", "transpile", "other"):
        if cat not in categories:
            continue
        keys = categories[cat]
        print(f"  {cat.upper()}")
        print(f"  {sep}")
        print(f"  {header}")
        print(f"  {sep}")

        for key in keys:
            short_name = key.split(" > ")[1] if " > " in key else key
            py = py_results.get(key, {})
            ts = ts_results.get(key, {})

            py_mean = py.get("mean", 0)
            ts_mean = ts.get("mean", 0)

            py_str = format_time(py_mean) if py_mean else "N/A"
            ts_str = format_time(ts_mean) if ts_mean else "N/A"

            if py_mean and ts_mean:
                ratio = py_mean / ts_mean
                ratio_str = f"{ratio:.2f}x"
                indicator = ratio_indicator(ratio)
            else:
                ratio_str = "N/A"
                indicator = ""

            print(f"  {short_name:<35} {py_str:>12} {ts_str:>12} {ratio_str:>15} {indicator:>18}")

        print()


def print_markdown(py_results, ts_results):
    """Print a GitHub-flavored markdown comparison table."""
    all_keys = sorted(set(list(py_results.keys()) + list(ts_results.keys())))

    print("## sqlglot (Python) vs sqlglot-ts (TypeScript) Benchmark Comparison\n")
    print("| Benchmark | Python | TypeScript | Ratio (Py/TS) | Result |")
    print("|-----------|-------:|-----------:|--------------:|--------|")

    for key in all_keys:
        py = py_results.get(key, {})
        ts = ts_results.get(key, {})
        py_mean = py.get("mean", 0)
        ts_mean = ts.get("mean", 0)

        py_str = format_time(py_mean) if py_mean else "N/A"
        ts_str = format_time(ts_mean) if ts_mean else "N/A"

        if py_mean and ts_mean:
            ratio = py_mean / ts_mean
            ratio_str = f"{ratio:.2f}x"
            indicator = ratio_indicator(ratio)
        else:
            ratio_str = "N/A"
            indicator = ""

        print(f"| {key} | {py_str} | {ts_str} | {ratio_str} | {indicator} |")


def main():
    parser = argparse.ArgumentParser(
        description="Compare sqlglot Python vs TypeScript benchmarks"
    )
    parser.add_argument("--json", action="store_true", help="Output raw JSON results")
    parser.add_argument(
        "--markdown", action="store_true", help="Output GitHub-flavored markdown"
    )
    parser.add_argument(
        "--py-only", action="store_true", help="Run only Python benchmarks"
    )
    parser.add_argument(
        "--ts-only", action="store_true", help="Run only TypeScript benchmarks"
    )
    args = parser.parse_args()

    py_results = {} if args.ts_only else run_python_benchmarks()
    ts_results = {} if args.py_only else run_ts_benchmarks()

    if args.json:
        combined = {"python": py_results, "typescript": ts_results}
        print(json.dumps(combined, indent=2))
    elif args.markdown:
        print_markdown(py_results, ts_results)
    else:
        print_table(py_results, ts_results)


if __name__ == "__main__":
    main()
