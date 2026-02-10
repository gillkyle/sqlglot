/**
 * Athena (AWS) dialect for sqlglot-ts.
 *
 * Athena's DML engine is based on Trino/Presto. This dialect uses
 * double-quote (") for identifier quoting, single-quote (') for strings,
 * and maps standard SQL types to Presto/Athena-compatible types:
 *   INT -> INTEGER, FLOAT -> REAL, TEXT -> VARCHAR, BINARY -> VARBINARY,
 *   BLOB -> VARBINARY, DATETIME -> TIMESTAMP, etc.
 *
 * Athena does not support ILIKE (inherited from Presto).
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Athena Tokenizer
// ---------------------------------------------------------------------------

class AthenaTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ['"'];
  static override QUOTES: Array<string | [string, string]> = ["'"];
  static override STRING_ESCAPES: string[] = ["'", "\\"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    ["/*", "*/"],
  ];

  static override HEX_STRINGS: Array<string | [string, string]> = [
    ["x'", "'"],
    ["X'", "'"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
    START: TokenType.BEGIN,
    ROW: TokenType.STRUCT,
  };
}

// ---------------------------------------------------------------------------
// Athena Generator
// ---------------------------------------------------------------------------

class AthenaGenerator extends Generator {
  /**
   * Type mapping for Athena/Presto-compatible type names.
   */
  private static TYPE_MAP: Record<string, string> = {
    BINARY: "VARBINARY",
    BLOB: "VARBINARY",
    DATETIME: "TIMESTAMP",
    FLOAT: "REAL",
    INT: "INTEGER",
    STRUCT: "ROW",
    TEXT: "VARCHAR",
    TIMESTAMPTZ: "TIMESTAMP",
    TIMESTAMPNTZ: "TIMESTAMP",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = AthenaGenerator.TYPE_MAP[typeValue] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }

  // Athena (Presto/Trino) does not support ILIKE, convert to LIKE
  override ilikeSql(expression: Expression): string {
    return this.binary(expression, "LIKE");
  }
}

// ---------------------------------------------------------------------------
// Athena Dialect
// ---------------------------------------------------------------------------

export class Athena extends Dialect {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";
  static override NORMALIZE_FUNCTIONS: string | boolean = "upper";

  static override TokenizerClass: any = AthenaTokenizer;
  static override GeneratorClass: typeof Generator = AthenaGenerator;
}

// Register the dialect
Dialect.register(["athena"], Athena);
