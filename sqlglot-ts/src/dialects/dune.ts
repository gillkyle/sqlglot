/**
 * Dune Analytics dialect for sqlglot-ts.
 *
 * Dune is built on Trino/Presto. It uses double-quote (") for identifier
 * quoting, single-quote for strings, and inherits Presto-like type mappings:
 * FLOAT -> REAL, TEXT -> VARCHAR, BLOB -> VARBINARY, DATETIME -> TIMESTAMP.
 *
 * Function names are normalized to uppercase (default behavior).
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Dune Tokenizer
// ---------------------------------------------------------------------------

class DuneTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ['"'];
  static override QUOTES: Array<string | [string, string]> = ["'"];
  static override STRING_ESCAPES: string[] = ["'"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    ["/*", "*/"],
  ];
}

// ---------------------------------------------------------------------------
// Dune Generator
// ---------------------------------------------------------------------------

class DuneGenerator extends Generator {
  /**
   * Type mapping for Dune-compatible type names.
   *
   * Dune is Trino/Presto based so it inherits similar type mappings:
   * - FLOAT -> REAL
   * - TEXT -> VARCHAR
   * - BLOB -> VARBINARY
   * - DATETIME -> TIMESTAMP
   * - BINARY -> VARBINARY
   *
   * INT, BIGINT, DOUBLE, VARCHAR, BOOLEAN, DATE, TIMESTAMP, DECIMAL
   * are kept as-is.
   */
  private static TYPE_MAP: Record<string, string> = {
    FLOAT: "REAL",
    TEXT: "VARCHAR",
    BLOB: "VARBINARY",
    BINARY: "VARBINARY",
    DATETIME: "TIMESTAMP",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = DuneGenerator.TYPE_MAP[typeValue] ?? typeValue;
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
// Dune Dialect
// ---------------------------------------------------------------------------

export class Dune extends Dialect {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";

  static override TokenizerClass: any = DuneTokenizer;
  static override GeneratorClass: typeof Generator = DuneGenerator;
}

// Register the dialect
Dialect.register(["dune"], Dune);
