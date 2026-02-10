/**
 * Exasol dialect for sqlglot-ts.
 *
 * Exasol uses double-quote (") for identifier quoting, single-quote (') for
 * strings with single-quote escaping ('' inside strings), and supports
 * -- and block comments.
 *
 * Type mappings follow Exasol's type alias rules:
 * - INT -> INTEGER, FLOAT -> DOUBLE, TEXT -> VARCHAR, BLOB/BINARY/VARBINARY -> VARCHAR
 * - DATETIME -> TIMESTAMP, TINYINT -> SMALLINT, etc.
 *
 * Exasol uses UPPERCASE normalization by default.
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Exasol Tokenizer
// ---------------------------------------------------------------------------

class ExasolTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ['"'];
  static override QUOTES: Array<string | [string, string]> = ["'"];
  static override STRING_ESCAPES: string[] = ["'"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    ["/*", "*/"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
    "LONG VARCHAR": TokenType.TEXT,
  };
}

// ---------------------------------------------------------------------------
// Exasol Generator
// ---------------------------------------------------------------------------

class ExasolGenerator extends Generator {
  /**
   * Type mapping for Exasol-specific type names.
   *
   * Based on https://docs.exasol.com/db/latest/sql_references/data_types/datatypealiases.htm
   * and https://docs.exasol.com/db/latest/sql_references/data_types/datatypedetails.htm
   */
  private static TYPE_MAP: Record<string, string> = {
    // Exasol does not have BLOB/BINARY/VARBINARY -- map to VARCHAR
    BLOB: "VARCHAR",
    BINARY: "VARCHAR",
    VARBINARY: "VARCHAR",
    // TEXT / LONGTEXT / TINYTEXT etc. -> VARCHAR
    TEXT: "VARCHAR",
    LONGTEXT: "VARCHAR",
    MEDIUMTEXT: "VARCHAR",
    TINYTEXT: "VARCHAR",
    LONGBLOB: "VARCHAR",
    MEDIUMBLOB: "VARCHAR",
    TINYBLOB: "VARCHAR",
    // Numeric aliases
    TINYINT: "SMALLINT",
    MEDIUMINT: "INT",
    FLOAT: "DOUBLE",
    DOUBLE: "DOUBLE PRECISION",
    // Temporal aliases
    DATETIME: "TIMESTAMP",
    TIMESTAMPTZ: "TIMESTAMP",
    TIMESTAMPLTZ: "TIMESTAMP",
    TIMESTAMPNTZ: "TIMESTAMP",
    // BIT -> BOOLEAN
    BIT: "BOOLEAN",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = ExasolGenerator.TYPE_MAP[typeValue] ?? typeValue;
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
// Exasol Dialect
// ---------------------------------------------------------------------------

export class Exasol extends Dialect {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";
  static override NORMALIZE_FUNCTIONS: string | boolean = "upper";

  static override TokenizerClass: any = ExasolTokenizer;
  static override GeneratorClass: typeof Generator = ExasolGenerator;
}

// Register the dialect
Dialect.register(["exasol"], Exasol);
