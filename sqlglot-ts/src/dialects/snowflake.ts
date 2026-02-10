/**
 * Snowflake dialect for sqlglot-ts.
 *
 * Snowflake uses double-quote (") for identifier quoting, uppercase function names,
 * supports // line comments, and has Snowflake-specific type mappings
 * (STRUCT -> OBJECT, TEXT -> VARCHAR, BIGDECIMAL -> DOUBLE, etc.).
 * FLOAT is mapped to DOUBLE at the tokenizer level.
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Snowflake Tokenizer
// ---------------------------------------------------------------------------

class SnowflakeTokenizer extends Tokenizer {
  static override STRING_ESCAPES: string[] = ["\\", "'"];
  static override HEX_STRINGS: Array<string | [string, string]> = [
    ["x'", "'"],
    ["X'", "'"],
  ];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    "//",
    ["/*", "*/"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
    BYTEINT: TokenType.INT,
    FLOAT: TokenType.DOUBLE,
    MINUS: TokenType.EXCEPT,
    "NCHAR VARYING": TokenType.VARCHAR,
    SAMPLE: TokenType.TABLE_SAMPLE,
    SQL_DOUBLE: TokenType.DOUBLE,
    SQL_VARCHAR: TokenType.VARCHAR,
    TIMESTAMP_TZ: TokenType.TIMESTAMPTZ,
  };
}

// ---------------------------------------------------------------------------
// Snowflake Generator
// ---------------------------------------------------------------------------

class SnowflakeGenerator extends Generator {
  /**
   * Type mapping for Snowflake-specific type names.
   */
  private static TYPE_MAP: Record<string, string> = {
    STRUCT: "OBJECT",
    NESTED: "OBJECT",
    TEXT: "VARCHAR",
    BIGDECIMAL: "DOUBLE",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = SnowflakeGenerator.TYPE_MAP[typeValue] ?? typeValue;
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
// Snowflake Dialect
// ---------------------------------------------------------------------------

export class Snowflake extends Dialect {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override NORMALIZE_FUNCTIONS: string | boolean = "upper";

  static override TokenizerClass: any = SnowflakeTokenizer;
  static override GeneratorClass: typeof Generator = SnowflakeGenerator;
}

// Register the dialect
Dialect.register(["snowflake"], Snowflake);
