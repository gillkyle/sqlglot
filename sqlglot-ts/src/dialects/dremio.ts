/**
 * Dremio dialect for sqlglot-ts.
 *
 * Dremio is built on Apache Calcite/Arrow. It uses double quotes for
 * identifier quoting, single quotes for strings, and maps standard SQL
 * types to Calcite/Arrow-compatible types.
 *
 * Reference: https://docs.dremio.com/current/reference/sql/data-types/
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Dremio Tokenizer
// ---------------------------------------------------------------------------

class DremioTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ['"'];
  static override QUOTES: Array<string | [string, string]> = ["'"];
  static override STRING_ESCAPES: string[] = ["'"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    ["/*", "*/"],
  ];
}

// ---------------------------------------------------------------------------
// Dremio Generator
// ---------------------------------------------------------------------------

class DremioGenerator extends Generator {
  /**
   * Type mapping for Dremio-compatible type names.
   *
   * Dremio (Calcite/Arrow) does not support TINYINT, SMALLINT, TEXT, BLOB,
   * DATETIME, BINARY, NCHAR, CHAR, TIMESTAMPNTZ, BIT, or ARRAY as type
   * names. These are mapped to their Dremio equivalents.
   */
  private static TYPE_MAP: Record<string, string> = {
    SMALLINT: "INT",
    TINYINT: "INT",
    BINARY: "VARBINARY",
    TEXT: "VARCHAR",
    NCHAR: "VARCHAR",
    CHAR: "VARCHAR",
    TIMESTAMPNTZ: "TIMESTAMP",
    DATETIME: "TIMESTAMP",
    ARRAY: "LIST",
    BIT: "BOOLEAN",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = DremioGenerator.TYPE_MAP[typeValue] ?? typeValue;
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
// Dremio Dialect
// ---------------------------------------------------------------------------

export class Dremio extends Dialect {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";

  static override TokenizerClass: any = DremioTokenizer;
  static override GeneratorClass: typeof Generator = DremioGenerator;
}

// Register the dialect
Dialect.register(["dremio"], Dremio);
