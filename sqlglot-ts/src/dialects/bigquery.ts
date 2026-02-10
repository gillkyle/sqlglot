/**
 * BigQuery dialect for sqlglot-ts.
 *
 * BigQuery uses backtick (`) for identifier quoting, single quotes for strings,
 * and has BigQuery-specific type names (INT64, FLOAT64, STRING, BOOL, BYTES, etc.).
 * Function names are case-sensitive (NORMALIZE_FUNCTIONS = false).
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// BigQuery Tokenizer
// ---------------------------------------------------------------------------

class BigQueryTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ["`"];
  static override QUOTES: Array<string | [string, string]> = ["'", '"'];
  static override STRING_ESCAPES: string[] = ["'", "\\"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    "#",
    ["/*", "*/"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
    INT64: TokenType.BIGINT,
    FLOAT64: TokenType.DOUBLE,
    BIGNUMERIC: TokenType.BIGDECIMAL,
    NUMERIC: TokenType.DECIMAL,
    BYTES: TokenType.BINARY,
    BOOL: TokenType.BOOLEAN,
    STRING: TokenType.TEXT,
    STRUCT: TokenType.STRUCT,
    DATETIME: TokenType.DATETIME,
  };
}

// ---------------------------------------------------------------------------
// BigQuery Generator
// ---------------------------------------------------------------------------

class BigQueryGenerator extends Generator {
  /**
   * Type mapping for BigQuery-specific type names.
   */
  private static TYPE_MAP: Record<string, string> = {
    INT: "INT64",
    BIGINT: "INT64",
    SMALLINT: "INT64",
    TINYINT: "INT64",
    FLOAT: "FLOAT64",
    DOUBLE: "FLOAT64",
    BOOLEAN: "BOOL",
    VARCHAR: "STRING",
    CHAR: "STRING",
    TEXT: "STRING",
    NCHAR: "STRING",
    NVARCHAR: "STRING",
    BINARY: "BYTES",
    VARBINARY: "BYTES",
    BLOB: "BYTES",
    DECIMAL: "NUMERIC",
    TIMESTAMP: "DATETIME",
    TIMESTAMPNTZ: "DATETIME",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = BigQueryGenerator.TYPE_MAP[typeValue] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }

  // BigQuery doesn't support ILIKE, convert to LIKE
  override ilikeSql(expression: Expression): string {
    return this.binary(expression, "LIKE");
  }
}

// ---------------------------------------------------------------------------
// BigQuery Dialect
// ---------------------------------------------------------------------------

export class BigQuery extends Dialect {
  static override IDENTIFIER_START = "`";
  static override IDENTIFIER_END = "`";
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";
  static override NORMALIZE_FUNCTIONS: string | boolean = false;

  static override TokenizerClass: any = BigQueryTokenizer;
  static override GeneratorClass: typeof Generator = BigQueryGenerator;
}

// Register the dialect
Dialect.register(["bigquery"], BigQuery);
