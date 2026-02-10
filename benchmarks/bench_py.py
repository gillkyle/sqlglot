"""
sqlglot (Python) benchmarks — counterpart to bench_ts.bench.ts.

Measures: parse, generate (parse→sql), and cross-dialect transpile.
Uses the same SQL queries as the TypeScript benchmarks for comparison.

Outputs JSON to stdout in a format the comparison script can consume.
"""

import json
import logging
import os
import statistics
import time

import sqlglot

logging.disable(logging.WARNING)

QUERIES_PATH = os.path.join(os.path.dirname(__file__), "queries.json")

with open(QUERIES_PATH) as f:
    QUERIES = json.load(f)

# Warm-up iterations before timing
WARMUP = 50
# Number of timed iterations
ITERATIONS = 500


def bench(fn, warmup=WARMUP, iterations=ITERATIONS):
    """Run fn for warmup+iterations, return per-call stats in seconds."""
    for _ in range(warmup):
        fn()

    times = []
    for _ in range(iterations):
        t0 = time.perf_counter()
        fn()
        t1 = time.perf_counter()
        times.append(t1 - t0)

    return {
        "mean": statistics.mean(times),
        "median": statistics.median(times),
        "min": min(times),
        "max": max(times),
        "stddev": statistics.stdev(times) if len(times) > 1 else 0,
        "samples": len(times),
    }


def run_benchmarks():
    results = {}

    # --- Parse ---
    for name in ("short", "long", "tpch"):
        sql = QUERIES[name]
        results[f"parse > {name}"] = bench(
            lambda s=sql: sqlglot.parse_one(s, error_level=sqlglot.ErrorLevel.IGNORE)
        )

    # --- Generate (parse + sql()) ---
    for name in ("short", "long", "tpch"):
        sql = QUERIES[name]
        results[f"generate > {name}"] = bench(
            lambda s=sql: sqlglot.parse_one(
                s, error_level=sqlglot.ErrorLevel.IGNORE
            ).sql()
        )

    # --- Transpile ---
    results["transpile > postgres_to_mysql"] = bench(
        lambda: sqlglot.transpile(
            QUERIES["transpile_postgres_to_mysql"],
            read="postgres",
            write="mysql",
            error_level=sqlglot.ErrorLevel.IGNORE,
        )
    )

    results["transpile > tpch_to_bigquery"] = bench(
        lambda: sqlglot.transpile(
            QUERIES["transpile_tpch_to_bigquery"],
            write="bigquery",
            error_level=sqlglot.ErrorLevel.IGNORE,
        )
    )

    results["transpile > tpch_identity"] = bench(
        lambda: sqlglot.transpile(
            QUERIES["tpch"], error_level=sqlglot.ErrorLevel.IGNORE
        )
    )

    return results


if __name__ == "__main__":
    results = run_benchmarks()
    print(json.dumps(results, indent=2))
