/**
 * BigQuery dialect for sqlglot-ts.
 *
 * BigQuery uses backtick (`) for identifier quoting, single quotes for strings,
 * and has BigQuery-specific type names (INT64, FLOAT64, STRING, BOOL, BYTES, etc.).
 * Function names are case-sensitive (NORMALIZE_FUNCTIONS = false).
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";
import * as exp from "../expressions.js";

// ---------------------------------------------------------------------------
// BigQuery Tokenizer
// ---------------------------------------------------------------------------

class BigQueryTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ["`"];
  static override QUOTES: Array<string | [string, string]> = ["'", '"'];
  static override STRING_ESCAPES: string[] = ["'", "\\"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    "#",
    ["/*", "*/"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
    INT64: TokenType.BIGINT,
    FLOAT64: TokenType.DOUBLE,
    BIGNUMERIC: TokenType.BIGDECIMAL,
    NUMERIC: TokenType.DECIMAL,
    BYTES: TokenType.BINARY,
    BOOL: TokenType.BOOLEAN,
    STRING: TokenType.TEXT,
    STRUCT: TokenType.STRUCT,
    DATETIME: TokenType.DATETIME,
    CURRENT_DATETIME: TokenType.CURRENT_DATETIME,
  };
}

// ---------------------------------------------------------------------------
// BigQuery Generator
// ---------------------------------------------------------------------------

// Date parts that should be uppercased in BigQuery function arguments
const DATE_PARTS = new Set([
  "YEAR", "QUARTER", "MONTH", "WEEK", "DAY", "HOUR", "MINUTE", "SECOND",
  "MILLISECOND", "MICROSECOND", "NANOSECOND", "DAYOFWEEK", "DAYOFYEAR",
  "ISOWEEK", "ISOYEAR", "DATE", "DATETIME", "TIME", "TIMESTAMP",
]);

// Types that should have their size/precision parameters stripped in BigQuery
const BQ_PARAMETERLESS_TYPES = new Set([
  "STRING",
  "NUMERIC",
  "BIGNUMERIC",
  "BOOL",
  "INT64",
  "FLOAT64",
  "BYTES",
  "DATETIME",
]);

class BigQueryGenerator extends Generator {
  /**
   * Type mapping for BigQuery-specific type names.
   * Maps internal/generic type names to BigQuery equivalents.
   */
  private static TYPE_MAP: Record<string, string> = {
    // Integer types -> INT64
    INT: "INT64",
    BIGINT: "INT64",
    SMALLINT: "INT64",
    TINYINT: "INT64",
    BYTEINT: "INT64",
    MEDIUMINT: "INT64",
    // Float types -> FLOAT64
    FLOAT: "FLOAT64",
    DOUBLE: "FLOAT64",
    REAL: "FLOAT64",
    // Boolean
    BOOLEAN: "BOOL",
    // String types -> STRING
    VARCHAR: "STRING",
    CHAR: "STRING",
    TEXT: "STRING",
    NCHAR: "STRING",
    NVARCHAR: "STRING",
    // Binary types -> BYTES
    BINARY: "BYTES",
    VARBINARY: "BYTES",
    BLOB: "BYTES",
    // Decimal types -> NUMERIC
    DECIMAL: "NUMERIC",
    // BigDecimal aliases -> BIGNUMERIC
    BIGDECIMAL: "BIGNUMERIC",
    // Timestamp types -> DATETIME
    TIMESTAMP: "DATETIME",
    TIMESTAMPNTZ: "DATETIME",
    // Struct aliases
    RECORD: "STRUCT",
  };

  /**
   * Function name mapping for BigQuery-specific function renames.
   * Maps generic/other-dialect function names to BigQuery equivalents.
   * These are applied when BigQuery is the write dialect.
   */
  private static FUNCTION_NAME_MAP: Record<string, string> = {
    // Aggregate functions
    COUNT_IF: "COUNTIF",
    COUNTIF: "COUNTIF",
    // Time construction functions
    MAKE_TIME: "TIME",
    MAKETIME: "TIME",
    TIME_FROM_PARTS: "TIME",
    TIMEFROMPARTS: "TIME",
    // Timestamp functions
    MAKE_TIMESTAMP: "TIMESTAMP_MICROS",
    // String functions
    CONTAINS: "CONTAINS_SUBSTR",
    OCTET_LENGTH: "BYTE_LENGTH",
    // Regex functions
    REGEXP_LIKE: "REGEXP_CONTAINS",
    REGEXP: "REGEXP_CONTAINS",
    // Safe arithmetic functions
    TRY_ADD: "SAFE_ADD",
    TRY_MULTIPLY: "SAFE_MULTIPLY",
    TRY_SUBTRACT: "SAFE_SUBTRACT",
    // Regex functions
    REGEXP_SUBSTR: "REGEXP_EXTRACT",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = BigQueryGenerator.TYPE_MAP[typeValue] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    // Strip size/precision parameters for types that don't support them in BigQuery
    if (BQ_PARAMETERLESS_TYPES.has(typeSql.toUpperCase())) {
      return typeSql;
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }

  /**
   * Helper to uppercase a date-part argument if it looks like a simple column/identifier
   * matching a known date part name (e.g., month -> MONTH).
   */
  private uppercaseDatePart(arg: Expression): string {
    // Check if arg is a Column with no table qualifier and a name matching a date part
    if (arg instanceof exp.Column) {
      const colName = arg.name;
      if (colName && DATE_PARTS.has(colName.toUpperCase()) && !arg.args["table"]) {
        return colName.toUpperCase();
      }
    }
    return this.sql(arg);
  }

  override anonymousSql(expression: Expression): string {
    const name = expression.this_ as string;
    const upper = (name || "").toUpperCase();
    const args = expression.expressions || [];

    // SPACE(n) -> REPEAT(' ', n)
    if (upper === "SPACE" && args.length === 1) {
      return `REPEAT(' ', ${this.sql(args[0])})`;
    }

    // SPLIT(string) -> SPLIT(string, ',') — add BigQuery default delimiter
    if (upper === "SPLIT" && args.length === 1) {
      return `SPLIT(${this.sql(args[0])}, ',')`;
    }

    // JSON_EXTRACT_SCALAR('5') -> JSON_EXTRACT_SCALAR('5', '$') — add default path
    if ((upper === "JSON_EXTRACT_SCALAR" || upper === "JSON_VALUE") && args.length === 1) {
      return `${name}(${this.sql(args[0])}, '$')`;
    }

    // TIMESTAMPDIFF(date_part, start, end) -> TIMESTAMP_DIFF(end, start, DATE_PART)
    if (upper === "TIMESTAMPDIFF" && args.length === 3) {
      const datePart = this.uppercaseDatePart(args[0]);
      const start = this.sql(args[1]);
      const end = this.sql(args[2]);
      return `TIMESTAMP_DIFF(${end}, ${start}, ${datePart})`;
    }

    // TIMESTAMP_DIFF and DATE_DIFF: uppercase the date-part argument (last arg)
    // Also handle WEEK(SUNDAY) -> WEEK (SUNDAY is the default week start)
    if ((upper === "TIMESTAMP_DIFF" || upper === "DATE_DIFF") && args.length >= 3) {
      const sqlArgs = args.map((a: Expression, i: number) => {
        if (i !== args.length - 1) return this.sql(a);
        // Check for WEEK(SUNDAY) pattern -> strip SUNDAY as it's the default
        if (a instanceof exp.Anonymous) {
          const aName = (a.this_ as string || "").toUpperCase();
          if (aName === "WEEK") {
            const innerArgs = a.expressions || [];
            if (innerArgs.length === 1 && innerArgs[0] instanceof exp.Column) {
              const dayName = (innerArgs[0].name || "").toUpperCase();
              if (dayName === "SUNDAY") {
                return "WEEK";
              }
            }
            // WEEK(MONDAY), WEEK(SATURDAY) etc. - keep the modifier
            if (innerArgs.length > 0) {
              const innerSql = innerArgs.map((ia: Expression) => {
                if (ia instanceof exp.Column) return (ia.name || "").toUpperCase();
                return this.sql(ia);
              }).join(", ");
              return `WEEK(${innerSql})`;
            }
            return "WEEK";
          }
        }
        return this.uppercaseDatePart(a);
      });
      return `${name}(${sqlArgs.join(", ")})`;
    }

    const mapped = BigQueryGenerator.FUNCTION_NAME_MAP[upper];
    if (mapped) {
      return this.func(mapped, ...args);
    }
    return this.func(
      this.sql(expression, "this"),
      ...args,
    );
  }

  // BigQuery outputs CURRENT_TIMESTAMP with parentheses
  override currenttimestampSql(expression: Expression): string {
    const zone = this.sql(expression, "this");
    if (zone) return `CURRENT_TIMESTAMP(${zone})`;
    return "CURRENT_TIMESTAMP()";
  }

  // BigQuery outputs CURRENT_TIME with parentheses
  override currenttimeSql(expression: Expression): string {
    const zone = this.sql(expression, "this");
    if (zone) return `CURRENT_TIME(${zone})`;
    return "CURRENT_TIME()";
  }

  // BigQuery outputs CURRENT_DATETIME with parentheses
  override currentdatetimeSql(expression: Expression): string {
    const zone = this.sql(expression, "this");
    if (zone) return `CURRENT_DATETIME(${zone})`;
    return "CURRENT_DATETIME()";
  }

  // BigQuery outputs CURRENT_DATE with parentheses (not AT TIME ZONE)
  override currentdateSql(expression: Expression): string {
    const zone = this.sql(expression, "this");
    if (zone) return `CURRENT_DATE(${zone})`;
    return "CURRENT_DATE";
  }

  // BigQuery doesn't support ILIKE, convert to LIKE
  override ilikeSql(expression: Expression): string {
    return this.binary(expression, "LIKE");
  }

  // BigQuery uses MOD(x, y) function syntax instead of x % y operator
  override modSql(expression: Expression): string {
    return this.func("MOD", expression.args["this"], expression.args["expression"]);
  }

  // BigQuery doesn't support column aliases on table references: t AS t(c1, c2) -> t AS t
  override tablealiasSql(expression: Expression): string {
    const alias = this.sql(expression, "this");
    return alias;
  }

  // MIN(x, y) with 2+ args -> LEAST(x, y) in BigQuery (scalar min)
  minSql(expression: Expression): string {
    const exprs = expression.expressions || [];
    if (exprs.length > 0) {
      return this.func("LEAST", expression.args["this"], ...exprs);
    }
    return this.func("MIN", expression.args["this"]);
  }

  // MAX(x, y) with 2+ args -> GREATEST(x, y) in BigQuery (scalar max)
  maxSql(expression: Expression): string {
    const exprs = expression.expressions || [];
    if (exprs.length > 0) {
      return this.func("GREATEST", expression.args["this"], ...exprs);
    }
    return this.func("MAX", expression.args["this"]);
  }
}

// ---------------------------------------------------------------------------
// BigQuery Dialect
// ---------------------------------------------------------------------------

/**
 * Mapping from BigQuery-specific type names to canonical/internal type names.
 * Applied during parsing so that other dialects' generators can map correctly.
 */
const BQ_TYPE_NORMALIZATION: Record<string, string> = {
  INT64: "BIGINT",
  FLOAT64: "DOUBLE",
  BOOL: "BOOLEAN",
  STRING: "TEXT",
  BYTES: "BINARY",
  NUMERIC: "DECIMAL",
  BIGNUMERIC: "BIGDECIMAL",
};

export class BigQuery extends Dialect {
  static override IDENTIFIER_START = "`";
  static override IDENTIFIER_END = "`";
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";
  static override NORMALIZE_FUNCTIONS: string | boolean = false;

  static override TokenizerClass: any = BigQueryTokenizer;
  static override GeneratorClass: typeof Generator = BigQueryGenerator;

  override parse(sql: string, opts: Record<string, any> = {}): Array<Expression | null> {
    const results = super.parse(sql, opts);

    // Normalize BigQuery-specific type names to canonical names in the AST.
    // This allows other dialects' generators to correctly map types.
    for (const result of results) {
      if (!result) continue;
      for (const node of result.walk(true)) {
        if (node instanceof exp.DataType) {
          const typeValue = node.this_;
          if (typeof typeValue === "string") {
            const canonical = BQ_TYPE_NORMALIZATION[typeValue];
            if (canonical) {
              node.args["this"] = canonical;
            }
          }
        }
      }
    }

    return results;
  }
}

// Register the dialect
Dialect.register(["bigquery"], BigQuery);
