/**
 * Materialize dialect for sqlglot-ts.
 *
 * Materialize is PostgreSQL-wire-compatible, so it inherits Postgres type mappings
 * and quoting conventions:
 * - Double-quote identifiers
 * - Single-quote strings with `'` escapes
 * - `--` and `/* * /` comments
 * - Type mappings: TINYINT -> SMALLINT, FLOAT -> REAL, DOUBLE -> DOUBLE PRECISION,
 *   BINARY/VARBINARY/BLOB -> BYTEA, DATETIME -> TIMESTAMP
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Materialize Tokenizer
// ---------------------------------------------------------------------------

class MaterializeTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ['"'];
  static override QUOTES: Array<string | [string, string]> = ["'"];
  static override STRING_ESCAPES: string[] = ["'"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    ["/*", "*/"],
  ];
}

// ---------------------------------------------------------------------------
// Materialize Generator
// ---------------------------------------------------------------------------

class MaterializeGenerator extends Generator {
  /**
   * Type mapping for Materialize.
   * Identical to Postgres type mappings since Materialize is Postgres-wire-compatible.
   */
  private static TYPE_MAP: Record<string, string> = {
    TINYINT: "SMALLINT",
    FLOAT: "REAL",
    DOUBLE: "DOUBLE PRECISION",
    BINARY: "BYTEA",
    VARBINARY: "BYTEA",
    BLOB: "BYTEA",
    DATETIME: "TIMESTAMP",
    TIMESTAMPNTZ: "TIMESTAMP",
  };

  /**
   * Map data types to Materialize-specific names.
   */
  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = MaterializeGenerator.TYPE_MAP[typeValue] ?? typeValue;
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
// Materialize Dialect
// ---------------------------------------------------------------------------

export class Materialize extends Dialect {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";
  static override NORMALIZE_FUNCTIONS: string | boolean = "upper";

  static override TokenizerClass: any = MaterializeTokenizer;
  static override GeneratorClass: typeof Generator = MaterializeGenerator;
}

// Register the Materialize dialect
Dialect.register(["materialize"], Materialize);
