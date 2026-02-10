/**
 * RisingWave dialect for sqlglot-ts.
 *
 * RisingWave is a streaming database built on PostgreSQL compatibility.
 * It uses the same identifier quoting (double quotes), string quoting
 * (single quotes), and type mappings as Postgres.
 *
 * Function names are normalized to uppercase (default behavior).
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";
import { Postgres, PostgresGenerator } from "./postgres.js";

// ---------------------------------------------------------------------------
// RisingWave Tokenizer
// ---------------------------------------------------------------------------

class RisingWaveTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ['"'];
  static override QUOTES: Array<string | [string, string]> = ["'"];
  static override STRING_ESCAPES: string[] = ["'"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    ["/*", "*/"],
  ];
}

// ---------------------------------------------------------------------------
// RisingWave Generator
// ---------------------------------------------------------------------------

class RisingWaveGenerator extends PostgresGenerator {
  /**
   * Type mapping for RisingWave-compatible type names.
   * Same as Postgres: TINYINT -> SMALLINT, FLOAT -> REAL,
   * DOUBLE -> DOUBLE PRECISION, BINARY/VARBINARY/BLOB -> BYTEA,
   * DATETIME -> TIMESTAMP.
   *
   * INT, BIGINT, SMALLINT, VARCHAR, CHAR, TEXT, BOOLEAN, DATE,
   * TIMESTAMP, DECIMAL are kept as-is.
   */
  private static TYPE_MAP: Record<string, string> = {
    TINYINT: "SMALLINT",
    FLOAT: "REAL",
    DOUBLE: "DOUBLE PRECISION",
    BINARY: "BYTEA",
    VARBINARY: "BYTEA",
    BLOB: "BYTEA",
    DATETIME: "TIMESTAMP",
    TIMESTAMPNTZ: "TIMESTAMP",
    SIGNED: "BIGINT",
    "SIGNED INTEGER": "BIGINT",
    UNSIGNED: "BIGINT",
    "UNSIGNED INTEGER": "BIGINT",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = RisingWaveGenerator.TYPE_MAP[typeValue] ?? typeValue;
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
// RisingWave Dialect
// ---------------------------------------------------------------------------

export class RisingWave extends Postgres {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override NORMALIZE_FUNCTIONS: string | boolean = "upper";

  static override TokenizerClass: any = RisingWaveTokenizer;
  static override GeneratorClass: typeof Generator = RisingWaveGenerator;
}

// Register the dialect
Dialect.register(["risingwave"], RisingWave);
