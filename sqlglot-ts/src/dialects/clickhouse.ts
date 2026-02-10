/**
 * ClickHouse dialect for sqlglot-ts.
 *
 * ClickHouse uses backtick (`) or double-quote (") for identifier quoting,
 * single quotes for strings, and has ClickHouse-specific types:
 * Int8/Int16/Int32/Int64, UInt8/UInt16/UInt32/UInt64, Float32/Float64,
 * String, Bool, DateTime, Array, Tuple, Map, etc.
 *
 * Function names are case-sensitive (NORMALIZE_FUNCTIONS = false).
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// ClickHouse Tokenizer
// ---------------------------------------------------------------------------

class ClickHouseTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ['"', "`"];
  static override QUOTES: Array<string | [string, string]> = ["'"];
  static override STRING_ESCAPES: string[] = ["'", "\\"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    "#",
    ["/*", "*/"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
    FLOAT32: TokenType.FLOAT,
    FLOAT64: TokenType.DOUBLE,
    INT8: TokenType.TINYINT,
    INT16: TokenType.SMALLINT,
    INT32: TokenType.INT,
    INT64: TokenType.BIGINT,
    UINT8: TokenType.UTINYINT,
    UINT16: TokenType.USMALLINT,
    UINT32: TokenType.UINT,
    UINT64: TokenType.UBIGINT,
    DATETIME64: TokenType.DATETIME64,
    DATE32: TokenType.DATE32,
    FIXEDSTRING: TokenType.FIXEDSTRING,
    LOWCARDINALITY: TokenType.LOWCARDINALITY,
    NESTED: TokenType.NESTED,
    TUPLE: TokenType.STRUCT,
    FINAL: TokenType.FINAL,
    GLOBAL: TokenType.GLOBAL,
  };
}

// ---------------------------------------------------------------------------
// ClickHouse Generator
// ---------------------------------------------------------------------------

class ClickHouseGenerator extends Generator {
  /**
   * Type mapping for ClickHouse-specific type names.
   */
  private static TYPE_MAP: Record<string, string> = {
    BOOLEAN: "Bool",
    TINYINT: "Int8",
    SMALLINT: "Int16",
    INT: "Int32",
    BIGINT: "Int64",
    FLOAT: "Float32",
    DOUBLE: "Float64",
    VARCHAR: "String",
    CHAR: "String",
    TEXT: "String",
    NCHAR: "String",
    NVARCHAR: "String",
    BINARY: "String",
    VARBINARY: "String",
    BLOB: "String",
    DATETIME: "DateTime",
    TIMESTAMP: "DateTime",
    TIMESTAMPNTZ: "DateTime",
    DATE: "Date",
    DECIMAL: "Decimal",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = ClickHouseGenerator.TYPE_MAP[typeValue] ?? typeValue;
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
// ClickHouse Dialect
// ---------------------------------------------------------------------------

export class ClickHouse extends Dialect {
  static override IDENTIFIER_START = "`";
  static override IDENTIFIER_END = "`";
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";
  static override NORMALIZE_FUNCTIONS: string | boolean = false;

  static override TokenizerClass: any = ClickHouseTokenizer;
  static override GeneratorClass: typeof Generator = ClickHouseGenerator;
}

// Register the dialect
Dialect.register(["clickhouse"], ClickHouse);
