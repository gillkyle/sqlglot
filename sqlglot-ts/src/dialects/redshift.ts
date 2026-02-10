/**
 * Redshift dialect for sqlglot-ts.
 *
 * Amazon Redshift is PostgreSQL-based, so it inherits Postgres type mappings
 * and adds Redshift-specific overrides:
 * - BINARY/VARBINARY/BLOB -> VARBYTE
 * - INT -> INTEGER
 * - ILIKE support (inherited from base, Redshift supports it natively)
 * - Double-quote identifier quoting (same as Postgres)
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Redshift Tokenizer
// ---------------------------------------------------------------------------

class RedshiftTokenizer extends Tokenizer {
  static override STRING_ESCAPES: string[] = ["\\", "'"];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
    SUPER: TokenType.SUPER,
    VARBYTE: TokenType.VARBINARY,
    HLLSKETCH: TokenType.HLLSKETCH,
  };
}

// ---------------------------------------------------------------------------
// Redshift Generator
// ---------------------------------------------------------------------------

class RedshiftGenerator extends Generator {
  /**
   * Type mapping for Redshift.
   * Inherits Postgres mappings and adds Redshift-specific overrides.
   */
  private static TYPE_MAP: Record<string, string> = {
    // Postgres-inherited mappings
    TINYINT: "SMALLINT",
    FLOAT: "REAL",
    DOUBLE: "DOUBLE PRECISION",
    DATETIME: "TIMESTAMP",
    TIMESTAMPNTZ: "TIMESTAMP",
    // Redshift-specific overrides
    BINARY: "VARBYTE",
    VARBINARY: "VARBYTE",
    BLOB: "VARBYTE",
    INT: "INTEGER",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = RedshiftGenerator.TYPE_MAP[typeValue] ?? typeValue;
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
// Redshift Dialect
// ---------------------------------------------------------------------------

export class Redshift extends Dialect {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override NORMALIZE_FUNCTIONS: string | boolean = "upper";

  static override TokenizerClass: any = RedshiftTokenizer;
  static override GeneratorClass: typeof Generator = RedshiftGenerator;
}

// Register the dialect
Dialect.register(["redshift"], Redshift);
