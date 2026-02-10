/**
 * sqlglot-ts benchmarks — run via `vitest bench` from the sqlglot-ts directory.
 *
 * Measures: parse, generate (parse→sql), and cross-dialect transpile.
 * Uses the same SQL queries as the Python benchmarks for apples-to-apples comparison.
 */
import { bench, describe } from "vitest";
import { parseOne, transpile } from "../src/index.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const queries = JSON.parse(
  readFileSync(resolve(__dirname, "../../benchmarks/queries.json"), "utf-8"),
);

// ---------------------------------------------------------------------------
// Parse benchmarks — tokenize + parse into AST
// ---------------------------------------------------------------------------
describe("parse", () => {
  bench("short", () => {
    parseOne(queries.short);
  });

  bench("long", () => {
    parseOne(queries.long);
  });

  bench("tpch", () => {
    parseOne(queries.tpch);
  });
});

// ---------------------------------------------------------------------------
// Generate benchmarks — parse then generate SQL back
// ---------------------------------------------------------------------------
describe("generate", () => {
  bench("short", () => {
    parseOne(queries.short).sql();
  });

  bench("long", () => {
    parseOne(queries.long).sql();
  });

  bench("tpch", () => {
    parseOne(queries.tpch).sql();
  });
});

// ---------------------------------------------------------------------------
// Transpile benchmarks — full parse→generate across dialects
// ---------------------------------------------------------------------------
describe("transpile", () => {
  bench("postgres_to_mysql", () => {
    transpile(queries.transpile_postgres_to_mysql, {
      readDialect: "postgres",
      writeDialect: "mysql",
    });
  });

  bench("tpch_to_bigquery", () => {
    transpile(queries.transpile_tpch_to_bigquery, {
      writeDialect: "bigquery",
    });
  });

  bench("tpch_identity", () => {
    transpile(queries.tpch);
  });
});
