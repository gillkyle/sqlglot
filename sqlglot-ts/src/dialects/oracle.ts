/**
 * Oracle dialect for sqlglot-ts.
 *
 * Oracle uses double-quote (") for identifier quoting, single quotes for strings,
 * and maps standard SQL types to Oracle-compatible types: NUMBER, BINARY_FLOAT,
 * BINARY_DOUBLE, CLOB, RAW, TIMESTAMP, VARCHAR2, etc.
 *
 * Oracle does NOT support ILIKE natively, so it is converted to LIKE.
 *
 * Function names are normalized to uppercase (default behavior).
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Oracle Tokenizer
// ---------------------------------------------------------------------------

class OracleTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ['"'];
  static override QUOTES: Array<string | [string, string]> = ["'"];
  static override STRING_ESCAPES: string[] = ["'", "\\"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    ["/*", "*/"],
  ];
}

// ---------------------------------------------------------------------------
// Oracle Generator
// ---------------------------------------------------------------------------

class OracleGenerator extends Generator {
  /**
   * Type mapping for Oracle-compatible type names.
   *
   * Maps standard SQL types to their Oracle equivalents:
   * - BOOLEAN -> NUMBER(1)
   * - TINYINT, SMALLINT, INT, BIGINT -> NUMBER
   * - FLOAT -> BINARY_FLOAT
   * - DOUBLE -> BINARY_DOUBLE
   * - TEXT -> CLOB
   * - BINARY, VARBINARY -> RAW
   * - DATETIME, TIME -> TIMESTAMP
   * - VARCHAR, CHAR, DATE, DECIMAL, BLOB -> kept as-is
   */
  private static TYPE_MAP: Record<string, string> = {
    BOOLEAN: "NUMBER(1)",
    TINYINT: "NUMBER",
    SMALLINT: "NUMBER",
    INT: "NUMBER",
    BIGINT: "NUMBER",
    FLOAT: "BINARY_FLOAT",
    DOUBLE: "BINARY_DOUBLE",
    TEXT: "CLOB",
    BINARY: "RAW",
    VARBINARY: "RAW",
    DATETIME: "TIMESTAMP",
    TIME: "TIMESTAMP",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = OracleGenerator.TYPE_MAP[typeValue] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    // For types that map to a fixed Oracle type (e.g., BOOLEAN -> NUMBER(1)),
    // don't append extra parenthesized parameters
    if (OracleGenerator.TYPE_MAP[typeValue as string]) {
      return typeSql;
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }

  // Oracle doesn't support ILIKE, convert to LIKE
  override ilikeSql(expression: Expression): string {
    return this.binary(expression, "LIKE");
  }
}

// ---------------------------------------------------------------------------
// Oracle Dialect
// ---------------------------------------------------------------------------

export class Oracle extends Dialect {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";

  static override TokenizerClass: any = OracleTokenizer;
  static override GeneratorClass: typeof Generator = OracleGenerator;
}

// Register the dialect
Dialect.register(["oracle"], Oracle);
