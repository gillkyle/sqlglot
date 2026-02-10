/**
 * Apache Drill dialect for sqlglot-ts.
 *
 * Drill uses backtick (`) for identifier quoting, single quotes for strings,
 * backslash string escapes, and maps standard SQL types to Drill-compatible
 * types (e.g. CHAR -> VARCHAR, BINARY -> VARBINARY, DATETIME -> TIMESTAMP).
 *
 * Function names preserve their original casing (NORMALIZE_FUNCTIONS = false
 * in the Python dialect), but the TS port normalizes to uppercase by default.
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Drill Tokenizer
// ---------------------------------------------------------------------------

class DrillTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ["`"];
  static override QUOTES: Array<string | [string, string]> = ["'"];
  static override STRING_ESCAPES: string[] = ["'"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    ["/*", "*/"],
  ];
}

// ---------------------------------------------------------------------------
// Drill Generator
// ---------------------------------------------------------------------------

class DrillGenerator extends Generator {
  /**
   * Type mapping for Drill-compatible type names.
   *
   * Drill's type system is relatively narrow. Many standard SQL types are
   * mapped to their closest Drill equivalents:
   *   - Character types (CHAR, TEXT, NCHAR, NVARCHAR) -> VARCHAR
   *   - Binary types (BLOB, BINARY) -> VARBINARY
   *   - Temporal types (DATETIME) -> TIMESTAMP
   *   - Integer types (INT, SMALLINT, TINYINT) -> INTEGER
   */
  private static TYPE_MAP: Record<string, string> = {
    INT: "INT",
    BIGINT: "BIGINT",
    SMALLINT: "INTEGER",
    TINYINT: "INTEGER",
    FLOAT: "FLOAT",
    DOUBLE: "DOUBLE",
    VARCHAR: "VARCHAR",
    CHAR: "VARCHAR",
    TEXT: "VARCHAR",
    NCHAR: "VARCHAR",
    NVARCHAR: "VARCHAR",
    BLOB: "VARBINARY",
    BINARY: "VARBINARY",
    VARBINARY: "VARBINARY",
    DATETIME: "TIMESTAMP",
    TIMESTAMPLTZ: "TIMESTAMP",
    TIMESTAMPTZ: "TIMESTAMP",
    BOOLEAN: "BOOLEAN",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = DrillGenerator.TYPE_MAP[typeValue] ?? typeValue;
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
// Drill Dialect
// ---------------------------------------------------------------------------

export class Drill extends Dialect {
  static override IDENTIFIER_START = "`";
  static override IDENTIFIER_END = "`";
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";

  static override TokenizerClass: any = DrillTokenizer;
  static override GeneratorClass: typeof Generator = DrillGenerator;
}

// Register the dialect
Dialect.register(["drill"], Drill);
