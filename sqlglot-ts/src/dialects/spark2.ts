/**
 * Spark2 dialect for sqlglot-ts.
 *
 * Apache Spark 2.x uses backtick (`) for identifier quoting,
 * single or double quotes for strings, backslash escapes, and maps
 * standard SQL types to Spark-compatible types: STRING, BINARY,
 * BOOLEAN, TIMESTAMP, etc.
 *
 * Unlike Hive, Spark2 supports ILIKE natively (the Python dialect
 * pops ILike from the Hive TRANSFORMS so it falls through to the
 * default ILIKE generation).
 *
 * Function names are normalized to uppercase (default behavior).
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Spark2 Tokenizer
// ---------------------------------------------------------------------------

class Spark2Tokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ["`"];
  static override QUOTES: Array<string | [string, string]> = ["'", '"'];
  static override STRING_ESCAPES: string[] = ["\\"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    ["/*", "*/"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
    LONG: TokenType.BIGINT,
    SHORT: TokenType.SMALLINT,
    BYTE: TokenType.TINYINT,
    STRING: TokenType.TEXT,
  };
}

// ---------------------------------------------------------------------------
// Spark2 Generator
// ---------------------------------------------------------------------------

class Spark2Generator extends Generator {
  /**
   * Type mapping for Spark2-compatible type names.
   *
   * Maps standard SQL types to Spark equivalents. Based on the Python
   * Hive/Spark2 dialect's Generator.TYPE_MAPPING.
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
      typeSql = Spark2Generator.TYPE_MAP[typeValue] ?? typeValue;
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
// Spark2 Dialect
// ---------------------------------------------------------------------------

export class Spark2 extends Dialect {
  static override IDENTIFIER_START = "`";
  static override IDENTIFIER_END = "`";
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";

  static override TokenizerClass: any = Spark2Tokenizer;
  static override GeneratorClass: typeof Generator = Spark2Generator;
}

// Register the dialect
Dialect.register(["spark2"], Spark2);
