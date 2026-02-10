/**
 * Spark SQL dialect for sqlglot-ts.
 *
 * Apache Spark uses backtick (`) for identifier quoting,
 * single or double quotes for strings, backslash escapes,
 * and maps standard SQL types to Spark-compatible types:
 * STRING, BINARY, BOOLEAN, TIMESTAMP, etc.
 *
 * Function names are normalized to uppercase (default behavior).
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Spark Tokenizer
// ---------------------------------------------------------------------------

class SparkTokenizer extends Tokenizer {
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
// Spark Generator
// ---------------------------------------------------------------------------

class SparkGenerator extends Generator {
  /**
   * Type mapping for Spark-compatible type names.
   */
  private static TYPE_MAP: Record<string, string> = {
    BIT: "BOOLEAN",
    BLOB: "BINARY",
    VARBINARY: "BINARY",
    DATETIME: "TIMESTAMP",
    TEXT: "STRING",
    VARCHAR: "STRING",
    CHAR: "STRING",
    NCHAR: "STRING",
    NVARCHAR: "STRING",
    TIME: "TIMESTAMP",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = SparkGenerator.TYPE_MAP[typeValue] ?? typeValue;
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
// Spark Dialect
// ---------------------------------------------------------------------------

export class Spark extends Dialect {
  static override IDENTIFIER_START = "`";
  static override IDENTIFIER_END = "`";
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";

  static override TokenizerClass: any = SparkTokenizer;
  static override GeneratorClass: typeof Generator = SparkGenerator;
}

// Register the dialect
Dialect.register(["spark", "sparksql"], Spark);
