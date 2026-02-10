/**
 * SingleStore dialect for sqlglot-ts.
 *
 * SingleStore is MySQL-compatible but uses `:>` for CAST and `!:>` for TRY_CAST,
 * and has unique type mappings (BSON, RECORD, GEOGRAPHYPOINT, etc.).
 */

import { Dialect } from "./dialect.js";
import { MySQLTokenizer, MySQLParser, MySQLGenerator, MySQL } from "./mysql.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// SingleStore Tokenizer
// ---------------------------------------------------------------------------

class SingleStoreTokenizer extends MySQLTokenizer {
  static override BYTE_STRINGS: Array<string | [string, string]> = [
    ["e'", "'"],
    ["E'", "'"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...MySQLTokenizer.KEYWORDS,
    "BSON": TokenType.JSONB,
    "GEOGRAPHYPOINT": TokenType.GEOGRAPHYPOINT,
    "RECORD": TokenType.STRUCT,
    ":>": TokenType.COLON_GT,
    "!:>": TokenType.NCOLON_GT,
    "::$": TokenType.DCOLONDOLLAR,
    "::%": TokenType.DCOLONPERCENT,
    "::?": TokenType.DCOLONQMARK,
  };
}

// ---------------------------------------------------------------------------
// SingleStore Generator
// ---------------------------------------------------------------------------

class SingleStoreGenerator extends MySQLGenerator {
  private static TYPE_MAP: Record<string, string> = {
    STRUCT: "RECORD",
    JSONB: "BSON",
    GEOMETRY: "GEOGRAPHY",
    POINT: "GEOGRAPHYPOINT",
    BIT: "BOOLEAN",
    BIGDECIMAL: "DECIMAL",
    FIXEDSTRING: "TEXT",
    DATE32: "DATE",
    DATETIME64: "DATETIME",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = SingleStoreGenerator.TYPE_MAP[typeValue] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }

  override castSql(expression: Expression): string {
    const thisSql = this.sql(expression, "this");
    const to = this.sql(expression, "to");
    return `${thisSql} :> ${to}`;
  }

  override trycastSql(expression: Expression): string {
    const thisSql = this.sql(expression, "this");
    const to = this.sql(expression, "to");
    return `${thisSql} !:> ${to}`;
  }
}

// ---------------------------------------------------------------------------
// SingleStore Dialect
// ---------------------------------------------------------------------------

export class SingleStore extends MySQL {
  static override TokenizerClass: any = SingleStoreTokenizer;
  static override GeneratorClass: typeof MySQLGenerator = SingleStoreGenerator;
}

// Register the dialect
Dialect.register(["singlestore"], SingleStore);
