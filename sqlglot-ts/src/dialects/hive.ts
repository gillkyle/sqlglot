/**
 * Hive dialect for sqlglot-ts.
 *
 * Apache Hive uses backtick (`) for identifier quoting, single or double
 * quotes for strings, backslash for string escapes, and maps standard SQL
 * types to Hive-compatible types: STRING, BINARY, BOOLEAN, TIMESTAMP, etc.
 *
 * Hive does NOT support ILIKE natively, so it is converted to LIKE.
 *
 * Function names are normalized to uppercase (default behavior).
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Hive Tokenizer
// ---------------------------------------------------------------------------

class HiveTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ["`"];
  static override QUOTES: Array<string | [string, string]> = ["'", '"'];
  static override STRING_ESCAPES: string[] = ["\\"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    ["/*", "*/"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
    STRING: TokenType.TEXT,
  };
}

// ---------------------------------------------------------------------------
// Hive Generator
// ---------------------------------------------------------------------------

class HiveGenerator extends Generator {
  /**
   * Type mapping for Hive-compatible type names.
   *
   * Maps standard SQL types to Hive equivalents. Based on the Python
   * Hive dialect's Generator.TYPE_MAPPING.
   */
  private static TYPE_MAP: Record<string, string> = {
    BIT: "BOOLEAN",
    BLOB: "BINARY",
    DATETIME: "TIMESTAMP",
    TEXT: "STRING",
    TIME: "TIMESTAMP",
    VARBINARY: "BINARY",
    VARCHAR: "STRING",
    CHAR: "STRING",
    NCHAR: "STRING",
    NVARCHAR: "STRING",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = HiveGenerator.TYPE_MAP[typeValue] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }

  /**
   * Hive does not support ILIKE. Convert to LIKE.
   */
  override ilikeSql(expression: Expression): string {
    return this.binary(expression, "LIKE");
  }
}

// ---------------------------------------------------------------------------
// Hive Dialect
// ---------------------------------------------------------------------------

export class Hive extends Dialect {
  static override IDENTIFIER_START = "`";
  static override IDENTIFIER_END = "`";
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";

  static override TokenizerClass: any = HiveTokenizer;
  static override GeneratorClass: typeof Generator = HiveGenerator;
}

// Register the dialect
Dialect.register(["hive"], Hive);
