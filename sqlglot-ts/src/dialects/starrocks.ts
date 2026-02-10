/**
 * StarRocks dialect for sqlglot-ts.
 *
 * StarRocks is MySQL-compatible and uses backtick (`) for identifier quoting,
 * single and double quotes for strings, backslash and quote-doubling for string
 * escapes, and supports `--`, `#`, and block comments.
 *
 * Type mappings reflect StarRocks' MySQL-compatible type system with some
 * differences: TEXT -> VARCHAR(65533), TIMESTAMP -> DATETIME, etc.
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// StarRocks Tokenizer
// ---------------------------------------------------------------------------

class StarRocksTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ["`"];
  static override QUOTES: Array<string | [string, string]> = ["'", '"'];
  static override STRING_ESCAPES: string[] = ["\\", "'"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    "#",
    ["/*", "*/"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
  };
}

// ---------------------------------------------------------------------------
// StarRocks Generator
// ---------------------------------------------------------------------------

class StarRocksGenerator extends Generator {
  /**
   * Type mapping for StarRocks-compatible type names.
   *
   * StarRocks is MySQL-compatible but uses STRING instead of TEXT,
   * DATETIME instead of TIMESTAMP, and keeps BLOB as BLOB.
   */
  private static TYPE_MAP: Record<string, string> = {
    TEXT: "VARCHAR",
    STRING: "VARCHAR",
    TIMESTAMP: "DATETIME",
    TIMESTAMPTZ: "DATETIME",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = StarRocksGenerator.TYPE_MAP[typeValue] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }

  // StarRocks does not support ILIKE; generate as LIKE instead
  override ilikeSql(expression: Expression): string {
    return this.binary(expression, "LIKE");
  }
}

// ---------------------------------------------------------------------------
// StarRocks Dialect
// ---------------------------------------------------------------------------

export class StarRocks extends Dialect {
  static override IDENTIFIER_START = "`";
  static override IDENTIFIER_END = "`";
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";

  static override TokenizerClass: any = StarRocksTokenizer;
  static override GeneratorClass: typeof Generator = StarRocksGenerator;
}

// Register the dialect
Dialect.register(["starrocks"], StarRocks);
