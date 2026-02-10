/**
 * Apache Doris dialect for sqlglot-ts.
 *
 * Doris is MySQL-compatible and uses backtick (`) for identifier quoting,
 * single and double quotes for strings, and maps standard SQL types to
 * Doris-compatible types: TEXT -> STRING, TIMESTAMP -> DATETIME, etc.
 *
 * Function names are normalized to uppercase (default behavior).
 */

import { Dialect } from "./dialect.js";
import { MySQLTokenizer, MySQLGenerator, MySQL } from "./mysql.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Doris Tokenizer
// ---------------------------------------------------------------------------

class DorisTokenizer extends MySQLTokenizer {
  // Doris inherits MySQL tokenizer behavior:
  // - Backtick identifiers
  // - Single + double quote strings
  // - Backslash and quote-doubling string escapes
  // - --, # and /* */ comments
  // No additional keyword overrides needed for the TS port at this time.
}

// ---------------------------------------------------------------------------
// Doris Generator
// ---------------------------------------------------------------------------

class DorisGenerator extends MySQLGenerator {
  /**
   * Type mapping for Doris-compatible type names.
   *
   * Doris is MySQL-compatible but overrides some type mappings:
   * - TEXT -> STRING (Doris uses STRING instead of TEXT)
   * - BLOB -> STRING (Doris maps BLOB to STRING)
   * - TIMESTAMP -> DATETIME (Doris prefers DATETIME over TIMESTAMP)
   * - TIMESTAMPTZ -> DATETIME
   *
   * INT, BIGINT, FLOAT, DOUBLE, VARCHAR, CHAR, DATE, BOOLEAN, DECIMAL
   * are kept as-is.
   */
  private static TYPE_MAP: Record<string, string> = {
    TEXT: "VARCHAR",
    BLOB: "STRING",
    TIMESTAMP: "DATETIME",
    TIMESTAMPTZ: "DATETIME",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = DorisGenerator.TYPE_MAP[typeValue] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }

  // Doris does not support ILIKE - generate as LIKE instead (inherited from MySQLGenerator)
}

// ---------------------------------------------------------------------------
// Doris Dialect
// ---------------------------------------------------------------------------

export class Doris extends MySQL {
  static override TokenizerClass: any = DorisTokenizer;
  static override GeneratorClass: typeof MySQLGenerator = DorisGenerator;
}

// Register the dialect
Dialect.register(["doris"], Doris);
