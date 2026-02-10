/**
 * T-SQL (SQL Server) dialect for sqlglot-ts.
 *
 * T-SQL uses square brackets [identifier] for identifier quoting (also supports
 * double-quotes). Strings use single quotes with quote-doubling for escapes.
 * T-SQL has its own type system with types like BIT (boolean), NVARCHAR, NCHAR,
 * DATETIME2, UNIQUEIDENTIFIER, MONEY, IMAGE, NTEXT, etc.
 *
 * T-SQL does not normalize function names by default (preserves case).
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// TSQL Tokenizer
// ---------------------------------------------------------------------------

class TSQLTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = [["[", "]"], '"'];
  static override QUOTES: Array<string | [string, string]> = ["'"];
  static override STRING_ESCAPES: string[] = ["'"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    ["/*", "*/"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
    DATETIME2: TokenType.DATETIME2,
    DATETIMEOFFSET: TokenType.TIMESTAMPTZ,
    IMAGE: TokenType.IMAGE,
    MONEY: TokenType.MONEY,
    NTEXT: TokenType.TEXT,
    REAL: TokenType.FLOAT,
    ROWVERSION: TokenType.ROWVERSION,
    SMALLDATETIME: TokenType.SMALLDATETIME,
    SMALLMONEY: TokenType.SMALLMONEY,
    SQL_VARIANT: TokenType.VARIANT,
    TIMESTAMP: TokenType.ROWVERSION,
    TINYINT: TokenType.UTINYINT,
    UNIQUEIDENTIFIER: TokenType.UUID,
    XML: TokenType.XML,
  };
}

// ---------------------------------------------------------------------------
// TSQL Generator
// ---------------------------------------------------------------------------

class TSQLGenerator extends Generator {
  /**
   * Type mapping from standard/internal types TO T-SQL type names.
   *
   * Based on the Python TSQL Generator TYPE_MAPPING:
   * - BOOLEAN -> BIT
   * - DOUBLE -> FLOAT
   * - INT -> INTEGER
   * - TEXT -> VARCHAR(MAX)
   * - TIMESTAMP -> DATETIME2
   * - TIMESTAMPNTZ -> DATETIME2
   * - TIMESTAMPTZ -> DATETIMEOFFSET
   * - UUID -> UNIQUEIDENTIFIER
   * - VARIANT -> SQL_VARIANT
   * - DECIMAL -> NUMERIC
   */
  private static TYPE_MAP: Record<string, string> = {
    BOOLEAN: "BIT",
    DOUBLE: "FLOAT",
    TEXT: "VARCHAR(MAX)",
    TIMESTAMP: "DATETIME2",
    TIMESTAMPNTZ: "DATETIME2",
    TIMESTAMPTZ: "DATETIMEOFFSET",
    UUID: "UNIQUEIDENTIFIER",
    VARIANT: "SQL_VARIANT",
    BLOB: "IMAGE",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = TSQLGenerator.TYPE_MAP[typeValue] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    // For types that map to compound names (like VARCHAR(MAX)), don't add interior params
    if (TSQLGenerator.TYPE_MAP[typeValue as string]) {
      return typeSql;
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }

  // T-SQL doesn't support ILIKE, convert to LIKE
  override ilikeSql(expression: Expression): string {
    return this.binary(expression, "LIKE");
  }

  // T-SQL uses 1 and 0 for boolean literals, not TRUE/FALSE
  override booleanSql(expression: Expression): string {
    return expression.this_ ? "1" : "0";
  }
}

// ---------------------------------------------------------------------------
// TSQL Dialect
// ---------------------------------------------------------------------------

export class TSQL extends Dialect {
  static override IDENTIFIER_START = "[";
  static override IDENTIFIER_END = "]";
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";

  static override TokenizerClass: any = TSQLTokenizer;
  static override GeneratorClass: typeof Generator = TSQLGenerator;
}

// Register the dialect
Dialect.register(["tsql"], TSQL);
