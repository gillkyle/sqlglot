/**
 * Apache Druid dialect for sqlglot-ts.
 *
 * Druid uses double-quote (") for identifier quoting, single-quote for strings,
 * and has simple type mappings: TEXT -> VARCHAR, BLOB -> VARCHAR,
 * DATETIME -> TIMESTAMP, NCHAR -> VARCHAR, NVARCHAR -> VARCHAR.
 *
 * Function names are normalized to uppercase (default behavior).
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Druid Tokenizer
// ---------------------------------------------------------------------------

class DruidTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ['"'];
  static override QUOTES: Array<string | [string, string]> = ["'"];
  static override STRING_ESCAPES: string[] = ["'"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    ["/*", "*/"],
  ];
}

// ---------------------------------------------------------------------------
// Druid Generator
// ---------------------------------------------------------------------------

class DruidGenerator extends Generator {
  /**
   * Type mapping for Druid-compatible type names.
   *
   * https://druid.apache.org/docs/latest/querying/sql-data-types/
   * Druid has a limited type system. NCHAR, NVARCHAR, TEXT, and BLOB
   * all map to VARCHAR. DATETIME maps to TIMESTAMP.
   */
  private static TYPE_MAP: Record<string, string> = {
    TEXT: "VARCHAR",
    BLOB: "VARCHAR",
    DATETIME: "TIMESTAMP",
    NCHAR: "VARCHAR",
    NVARCHAR: "VARCHAR",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = DruidGenerator.TYPE_MAP[typeValue] ?? typeValue;
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
// Druid Dialect
// ---------------------------------------------------------------------------

export class Druid extends Dialect {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";

  static override TokenizerClass: any = DruidTokenizer;
  static override GeneratorClass: typeof Generator = DruidGenerator;
}

// Register the dialect
Dialect.register(["druid"], Druid);
