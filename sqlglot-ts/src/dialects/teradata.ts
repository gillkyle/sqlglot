/**
 * Teradata dialect for sqlglot-ts.
 *
 * Teradata uses double-quote (") for identifier quoting, single-quote (')
 * for strings with single-quote escaping ('' to escape a quote within a
 * string), and standard SQL comments (-- and block comments).
 *
 * Teradata supports most standard SQL types directly. Key type mappings:
 *   - TEXT -> CLOB (Teradata uses CLOB for large text)
 *   - BOOLEAN -> BYTEINT (Teradata traditionally uses BYTEINT for booleans)
 *   - TINYINT -> BYTEINT
 *   - DOUBLE -> DOUBLE PRECISION
 *   - DATETIME -> TIMESTAMP
 *   - VARBINARY -> BLOB
 *
 * Function names are normalized to uppercase (default behavior).
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Teradata Tokenizer
// ---------------------------------------------------------------------------

class TeradataTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ['"'];
  static override QUOTES: Array<string | [string, string]> = ["'"];
  static override STRING_ESCAPES: string[] = ["'"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    ["/*", "*/"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
    BYTEINT: TokenType.SMALLINT,
    SEL: TokenType.SELECT,
    TOP: TokenType.TOP,
  };
}

// ---------------------------------------------------------------------------
// Teradata Generator
// ---------------------------------------------------------------------------

class TeradataGenerator extends Generator {
  /**
   * Type mapping: standard types to Teradata type names.
   *
   * Teradata supports INT, BIGINT, SMALLINT, FLOAT, VARCHAR, CHAR, DATE,
   * TIMESTAMP, DECIMAL natively. The mappings below cover types that need
   * translation.
   */
  private static TYPE_MAP: Record<string, string> = {
    TEXT: "CLOB",
    BOOLEAN: "BYTEINT",
    TINYINT: "BYTEINT",
    DOUBLE: "DOUBLE PRECISION",
    DATETIME: "TIMESTAMP",
    VARBINARY: "BLOB",
    TIMESTAMPTZ: "TIMESTAMP",
    BIT: "BYTEINT",
    NCHAR: "CHAR",
    NVARCHAR: "VARCHAR",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = TeradataGenerator.TYPE_MAP[typeValue] ?? typeValue;
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
// Teradata Dialect
// ---------------------------------------------------------------------------

export class Teradata extends Dialect {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";
  static override NORMALIZE_FUNCTIONS: string | boolean = "upper";

  static override TokenizerClass: any = TeradataTokenizer;
  static override GeneratorClass: typeof Generator = TeradataGenerator;
}

// Register the dialect
Dialect.register(["teradata"], Teradata);
