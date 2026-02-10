/**
 * DuckDB dialect for sqlglot-ts.
 *
 * DuckDB uses double-quote (") for identifier quoting, single quotes for strings,
 * and has DuckDB-specific type mappings (BINARY -> BLOB, VARCHAR -> TEXT, etc.).
 * DuckDB natively supports ILIKE.
 */

import { Dialect } from "./dialect.js";
import { Generator } from "../generator.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// DuckDB Generator
// ---------------------------------------------------------------------------

class DuckDBGenerator extends Generator {
  /**
   * Type mapping for DuckDB-specific type names.
   */
  private static TYPE_MAP: Record<string, string> = {
    BINARY: "BLOB",
    VARBINARY: "BLOB",
    CHAR: "TEXT",
    NCHAR: "TEXT",
    NVARCHAR: "TEXT",
    VARCHAR: "TEXT",
    FLOAT: "REAL",
    DATETIME: "TIMESTAMP",
    TIMESTAMPNTZ: "TIMESTAMP",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = DuckDBGenerator.TYPE_MAP[typeValue] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }
}

// ---------------------------------------------------------------------------
// DuckDB Dialect
// ---------------------------------------------------------------------------

export class DuckDB extends Dialect {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override NORMALIZE_FUNCTIONS: string | boolean = "upper";

  static override GeneratorClass: typeof Generator = DuckDBGenerator;
}

// Register the dialect
Dialect.register(["duckdb"], DuckDB);
