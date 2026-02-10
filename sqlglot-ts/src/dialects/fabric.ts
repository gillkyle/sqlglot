/**
 * Microsoft Fabric dialect for sqlglot-ts.
 *
 * Microsoft Fabric Data Warehouse uses T-SQL-style bracket identifiers ([col]),
 * single-quote strings, and maps standard SQL types to Fabric-supported types:
 * BOOLEAN -> BIT, TEXT -> VARCHAR, BLOB -> VARBINARY, DOUBLE -> FLOAT, etc.
 *
 * Key differences from T-SQL:
 * - Case-sensitive identifiers (unlike T-SQL which is case-insensitive)
 * - Limited data type support with mappings to supported alternatives
 * - Unicode types (NCHAR, NVARCHAR) mapped to non-unicode equivalents (CHAR, VARCHAR)
 * - DECIMAL stays as DECIMAL (T-SQL uses NUMERIC)
 * - INT stays as INT (T-SQL uses INTEGER)
 *
 * References:
 * - Data Types: https://learn.microsoft.com/en-us/fabric/data-warehouse/data-types
 * - T-SQL Surface Area: https://learn.microsoft.com/en-us/fabric/data-warehouse/tsql-surface-area
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Fabric Tokenizer
// ---------------------------------------------------------------------------

class FabricTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = [
    ["[", "]"],
    '"',
  ];
  static override QUOTES: Array<string | [string, string]> = ["'"];
  static override STRING_ESCAPES: string[] = ["'"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    ["/*", "*/"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
    DATETIME2: TokenType.DATETIME,
    REAL: TokenType.FLOAT,
    UNIQUEIDENTIFIER: TokenType.VARCHAR,
    NTEXT: TokenType.TEXT,
    IMAGE: TokenType.VARBINARY,
    MONEY: TokenType.DECIMAL,
    SMALLMONEY: TokenType.DECIMAL,
    SMALLDATETIME: TokenType.DATETIME,
    ROWVERSION: TokenType.VARBINARY,
    SQL_VARIANT: TokenType.VARCHAR,
  };
}

// ---------------------------------------------------------------------------
// Fabric Generator
// ---------------------------------------------------------------------------

class FabricGenerator extends Generator {
  /**
   * Type mapping for Fabric-compatible type names.
   *
   * Based on TSQL Generator TYPE_MAPPING with Fabric-specific overrides:
   * - BOOLEAN -> BIT (like TSQL)
   * - TEXT -> VARCHAR (like TSQL, but without MAX)
   * - BLOB -> VARBINARY
   * - DOUBLE -> FLOAT (like TSQL)
   * - NCHAR -> CHAR (Fabric maps unicode to non-unicode)
   * - NVARCHAR -> VARCHAR (Fabric maps unicode to non-unicode)
   * - DATETIME -> DATETIME2 (Fabric uses DATETIME2)
   * - TIMESTAMP -> DATETIME2
   * - TINYINT -> SMALLINT (Fabric TINYINT is unsigned in TSQL)
   * - JSON -> VARCHAR (Fabric doesn't have native JSON type)
   * - XML -> VARCHAR (Fabric doesn't have native XML type)
   */
  private static TYPE_MAP: Record<string, string> = {
    // Standard type mappings
    BOOLEAN: "BIT",
    TEXT: "VARCHAR",
    BLOB: "VARBINARY",
    DOUBLE: "FLOAT",

    // Unicode to non-unicode
    NCHAR: "CHAR",
    NVARCHAR: "VARCHAR",

    // Temporal types
    DATETIME: "DATETIME2",
    TIMESTAMP: "DATETIME2",
    TIMESTAMPNTZ: "DATETIME2",
    TIMESTAMPTZ: "DATETIMEOFFSET",

    // Fabric-specific mappings
    JSON: "VARCHAR",
    XML: "VARCHAR",
    IMAGE: "VARBINARY",
    MONEY: "DECIMAL",
    SMALLMONEY: "DECIMAL",
    SMALLDATETIME: "DATETIME2",
    TINYINT: "SMALLINT",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = FabricGenerator.TYPE_MAP[typeValue] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }

  // Fabric doesn't support ILIKE, convert to LIKE
  override ilikeSql(expression: Expression): string {
    return this.binary(expression, "LIKE");
  }

  // Fabric uses 1 and 0 for boolean literals (BIT type), not TRUE/FALSE
  override booleanSql(expression: Expression): string {
    return expression.this_ ? "1" : "0";
  }
}

// ---------------------------------------------------------------------------
// Fabric Dialect
// ---------------------------------------------------------------------------

export class Fabric extends Dialect {
  static override IDENTIFIER_START = "[";
  static override IDENTIFIER_END = "]";
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";

  static override TokenizerClass: any = FabricTokenizer;
  static override GeneratorClass: typeof Generator = FabricGenerator;
}

// Register the dialect
Dialect.register(["fabric"], Fabric);
