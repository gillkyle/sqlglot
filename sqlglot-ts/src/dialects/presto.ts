/**
 * Presto dialect for sqlglot-ts.
 *
 * Presto uses double-quote (") for identifier quoting, uppercase function names,
 * x'/X' hex strings, and has Presto-specific type mappings
 * (STRUCT -> ROW, INT -> INTEGER, FLOAT -> REAL, TEXT -> VARCHAR, etc.).
 * Presto does not support ILIKE.
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Presto Tokenizer
// ---------------------------------------------------------------------------

class PrestoTokenizer extends Tokenizer {
  static override HEX_STRINGS: Array<string | [string, string]> = [
    ["x'", "'"],
    ["X'", "'"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
    START: TokenType.BEGIN,
    ROW: TokenType.STRUCT,
  };
}

// ---------------------------------------------------------------------------
// Presto Generator
// ---------------------------------------------------------------------------

class PrestoGenerator extends Generator {
  /**
   * Type mapping for Presto-specific type names.
   */
  private static TYPE_MAP: Record<string, string> = {
    BINARY: "VARBINARY",
    DATETIME: "TIMESTAMP",
    FLOAT: "REAL",
    INT: "INTEGER",
    STRUCT: "ROW",
    TEXT: "VARCHAR",
    TIMESTAMPTZ: "TIMESTAMP",
    TIMESTAMPNTZ: "TIMESTAMP",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = PrestoGenerator.TYPE_MAP[typeValue] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }

  // Presto doesn't support ILIKE, convert to LIKE
  override ilikeSql(expression: Expression): string {
    return this.binary(expression, "LIKE");
  }
}

// ---------------------------------------------------------------------------
// Presto Dialect
// ---------------------------------------------------------------------------

export class Presto extends Dialect {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override NORMALIZE_FUNCTIONS: string | boolean = "upper";

  static override TokenizerClass: any = PrestoTokenizer;
  static override GeneratorClass: typeof Generator = PrestoGenerator;
}

// Register the dialect
Dialect.register(["presto"], Presto);
