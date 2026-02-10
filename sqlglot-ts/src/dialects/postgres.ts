/**
 * PostgreSQL dialect for sqlglot-ts.
 *
 * Implements Postgres-specific SQL generation including:
 * - Type mappings (TINYINT -> SMALLINT, FLOAT -> REAL, DOUBLE -> DOUBLE PRECISION, etc.)
 * - `ILIKE` support (inherited from base)
 * - `NOW()` -> `CURRENT_TIMESTAMP`
 * - Postgres-specific data types (BYTEA, SERIAL, etc.)
 */

import { Dialect } from "./dialect.js";
import { Generator } from "../generator.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Postgres Generator
// ---------------------------------------------------------------------------

export class PostgresGenerator extends Generator {
  /**
   * Type mapping for Postgres-specific type names.
   * Maps internal type names to their Postgres equivalents.
   */
  private static TYPE_MAP: Record<string, string> = {
    TINYINT: "SMALLINT",
    FLOAT: "DOUBLE PRECISION",
    FLOAT4: "REAL",
    FLOAT8: "DOUBLE PRECISION",
    DOUBLE: "DOUBLE PRECISION",
    INT8: "BIGINT",
    BINARY: "BYTEA",
    VARBINARY: "BYTEA",
    DATETIME: "TIMESTAMP",
    TIMESTAMPNTZ: "TIMESTAMP",
    BLOB: "BYTEA",
    SIGNED: "BIGINT",
    "SIGNED INTEGER": "BIGINT",
    UNSIGNED: "BIGINT",
    "UNSIGNED INTEGER": "BIGINT",
  };

  /**
   * Function name mapping for Postgres-specific function renames.
   */
  private static FUNCTION_NAME_MAP: Record<string, string> = {
    CHAR_LENGTH: "LENGTH",
    CHARACTER_LENGTH: "LENGTH",
    VARIANCE: "VAR_SAMP",
    VARIANCE_POP: "VAR_POP",
    LOGICAL_OR: "BOOL_OR",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = PostgresGenerator.TYPE_MAP[typeValue] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }

  override anonymousSql(expression: Expression): string {
    const name = expression.this_ as string;
    const upper = (name || "").toUpperCase();
    const mapped = PostgresGenerator.FUNCTION_NAME_MAP[upper];
    if (mapped) {
      return this.func(mapped, ...(expression.expressions || []));
    }
    return this.func(
      this.sql(expression, "this"),
      ...(expression.expressions || []),
    );
  }
}

// ---------------------------------------------------------------------------
// Postgres Dialect
// ---------------------------------------------------------------------------

export class Postgres extends Dialect {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override NORMALIZE_FUNCTIONS: string | boolean = "upper";

  static override GeneratorClass: typeof Generator = PostgresGenerator;
}

// Register the Postgres dialect
Dialect.register(["postgres", "postgresql"], Postgres);
