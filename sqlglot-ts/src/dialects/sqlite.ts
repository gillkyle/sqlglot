/**
 * SQLite dialect for sqlglot-ts.
 *
 * SQLite uses double-quote (") for identifier quoting (also supports backticks
 * and square brackets). It has a simplified type system with five storage classes:
 * NULL, INTEGER, REAL, TEXT, and BLOB. SQLite does not support ILIKE.
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// SQLite Tokenizer
// ---------------------------------------------------------------------------

class SQLiteTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ['"', "`", ["[", "]"]];
  static override QUOTES: Array<string | [string, string]> = ["'"];
  static override STRING_ESCAPES: string[] = ["'"];
  static override HEX_STRINGS: Array<string | [string, string]> = [
    ["x'", "'"],
    ["X'", "'"],
    ["0x", ""],
    ["0X", ""],
  ];
}

// ---------------------------------------------------------------------------
// SQLite Generator
// ---------------------------------------------------------------------------

class SQLiteGenerator extends Generator {
  /**
   * Type mapping for SQLite's simplified type system.
   * SQLite has five storage classes: NULL, INTEGER, REAL, TEXT, BLOB.
   */
  private static TYPE_MAP: Record<string, string> = {
    BOOLEAN: "INTEGER",
    TINYINT: "INTEGER",
    SMALLINT: "INTEGER",
    INT: "INTEGER",
    BIGINT: "INTEGER",
    FLOAT: "REAL",
    DOUBLE: "REAL",
    DECIMAL: "REAL",
    CHAR: "TEXT",
    NCHAR: "TEXT",
    VARCHAR: "TEXT",
    NVARCHAR: "TEXT",
    BINARY: "BLOB",
    VARBINARY: "BLOB",
    DATETIME: "TEXT",
    TIMESTAMP: "TEXT",
    TIMESTAMPNTZ: "TEXT",
    DATE: "TEXT",
    TIME: "TEXT",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = SQLiteGenerator.TYPE_MAP[typeValue] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    // SQLite doesn't use type parameters (e.g., VARCHAR(100) -> TEXT)
    // but we preserve them for types not in the map
    if (SQLiteGenerator.TYPE_MAP[typeValue as string]) {
      return typeSql;
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }

  // SQLite doesn't support ILIKE, convert to LIKE
  override ilikeSql(expression: Expression): string {
    return this.binary(expression, "LIKE");
  }
}

// ---------------------------------------------------------------------------
// SQLite Dialect
// ---------------------------------------------------------------------------

export class SQLite extends Dialect {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";

  static override TokenizerClass: any = SQLiteTokenizer;
  static override GeneratorClass: typeof Generator = SQLiteGenerator;
}

// Register the dialect
Dialect.register(["sqlite"], SQLite);
