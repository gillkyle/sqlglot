/**
 * Tableau dialect for sqlglot-ts.
 *
 * Tableau uses double-quote for identifier quoting and single-quote for
 * strings. It has minimal type mappings (most standard SQL types are
 * kept as-is).
 *
 * Function names are normalized to uppercase (default behavior).
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Tableau Tokenizer
// ---------------------------------------------------------------------------

class TableauTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ['"'];
  static override QUOTES: Array<string | [string, string]> = ["'"];
  static override STRING_ESCAPES: string[] = ["'"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    ["/*", "*/"],
  ];
}

// ---------------------------------------------------------------------------
// Tableau Generator
// ---------------------------------------------------------------------------

class TableauGenerator extends Generator {
  /**
   * Type mapping for Tableau-compatible type names.
   * Minimal mappings -- most types are kept as-is.
   */
  private static TYPE_MAP: Record<string, string> = {
    TEXT: "VARCHAR",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = TableauGenerator.TYPE_MAP[typeValue] ?? typeValue;
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
// Tableau Dialect
// ---------------------------------------------------------------------------

export class Tableau extends Dialect {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";
  static override NORMALIZE_FUNCTIONS: string | boolean = "upper";

  static override TokenizerClass: any = TableauTokenizer;
  static override GeneratorClass: typeof Generator = TableauGenerator;
}

// Register the dialect
Dialect.register(["tableau"], Tableau);
