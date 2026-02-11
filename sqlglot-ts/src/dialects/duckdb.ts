/**
 * DuckDB dialect for sqlglot-ts.
 *
 * DuckDB uses double-quote (") for identifier quoting, single quotes for strings,
 * and has DuckDB-specific type mappings (BINARY -> BLOB, VARCHAR -> TEXT, etc.).
 * DuckDB natively supports ILIKE.
 */

import { Dialect } from "./dialect.js";
import { Generator } from "../generator.js";
import type { Expression } from "../expressions.js";

// Types that should have their size/precision parameters stripped in DuckDB
// (e.g., VARCHAR(5) -> TEXT, TIME(6) -> TIME)
const PARAMETERLESS_TYPES = new Set([
  "TEXT",
  "TIME",
]);

// ---------------------------------------------------------------------------
// DuckDB Generator
// ---------------------------------------------------------------------------

class DuckDBGenerator extends Generator {
  /**
   * Type mapping for DuckDB-specific type names.
   * Maps type aliases and non-canonical type names to DuckDB canonical forms.
   */
  private static TYPE_MAP: Record<string, string> = {
    // Text types -> TEXT
    BINARY: "BLOB",
    BPCHAR: "TEXT",
    CHAR: "TEXT",
    LONGTEXT: "TEXT",
    MEDIUMTEXT: "TEXT",
    NCHAR: "TEXT",
    NVARCHAR: "TEXT",
    STRING: "TEXT",
    TEXT: "TEXT",
    TINYTEXT: "TEXT",
    VARCHAR: "TEXT",

    // Binary types -> BLOB
    LONGBLOB: "BLOB",
    MEDIUMBLOB: "BLOB",
    ROWVERSION: "BLOB",
    TINYBLOB: "BLOB",
    VARBINARY: "BLOB",
    BYTEA: "BLOB",

    // Integer aliases
    INT1: "TINYINT",
    INT4: "INT",
    INT8: "BIGINT",
    INT16: "SMALLINT",
    INT32: "INT",
    INT64: "BIGINT",
    INTEGER: "INT",
    SIGNED: "INT",
    HUGEINT: "INT128",
    UHUGEINT: "UINT128",

    // Float/double aliases
    FLOAT: "REAL",
    FLOAT4: "REAL",

    // Decimal aliases (bare DECIMAL/NUMERIC/NUMBER get special handling below)
    NUMERIC: "DECIMAL",
    NUMBER: "DECIMAL",

    // Boolean aliases
    LOGICAL: "BOOLEAN",

    // Bit alias
    BITSTRING: "BIT",

    // Timestamp aliases
    DATETIME: "TIMESTAMP",
    DATETIME2: "TIMESTAMP",
    SMALLDATETIME: "TIMESTAMP",
    TIMESTAMPNTZ: "TIMESTAMP",
    TIMESTAMPLTZ: "TIMESTAMPTZ",

    // JSON
    JSONB: "JSON",

    // Big decimal
    BIGDECIMAL: "DECIMAL(38, 5)",
    DECFLOAT: "DECIMAL(38, 5)",
  };

  /**
   * Function name mapping for DuckDB-specific function renames.
   * Maps parsed function names (uppercase) to DuckDB canonical forms.
   */
  private static FUNCTION_NAME_MAP: Record<string, string> = {
    // DuckDB canonical renames
    EDITDIST3: "LEVENSHTEIN",
    LIST_SORT: "ARRAY_SORT",
    LIST_REVERSE_SORT: "ARRAY_REVERSE_SORT",
    DATEDIFF: "DATE_DIFF",
    LIST_VALUE: "LIST_VALUE",
    ARRAY_JOIN: "ARRAY_TO_STRING",
    APPROX_PERCENTILE: "APPROX_QUANTILE",
    BITOR_AGG: "BIT_OR",
    BITAND_AGG: "BIT_AND",
    BITXOR_AGG: "BIT_XOR",
    IS_NAN: "ISNAN",
    IS_INF: "ISINF",
    TO_UNIXTIME: "EPOCH",
    TO_UTF8: "ENCODE",
  };

  /**
   * Functions that should be replaced with non-function forms (keywords, etc.)
   */
  private static FUNCTION_TO_KEYWORD: Record<string, string> = {
    TODAY: "CURRENT_DATE",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      const upper = typeValue.toUpperCase();
      typeSql = DuckDBGenerator.TYPE_MAP[upper] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    // For bare DECIMAL/NUMERIC/NUMBER without parameters, default to DECIMAL(18, 3)
    const upperTypeSql = typeSql.toUpperCase();
    if (upperTypeSql === "DECIMAL") {
      const interior = this.expressions(expression, { flat: true });
      if (!interior) {
        return "DECIMAL(18, 3)";
      }
      return `DECIMAL(${interior})`;
    }

    // Types like BIGDECIMAL that map to DECIMAL(38, 5) already include params
    if (typeSql.includes("(")) {
      return typeSql;
    }

    // Strip size parameters for types that don't need them in DuckDB
    if (PARAMETERLESS_TYPES.has(upperTypeSql)) {
      return typeSql;
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }

  // DuckDB doesn't use LEFT for SEMI/ANTI joins
  override joinSql(expression: Expression): string {
    const kind = expression.text("kind").toUpperCase();
    if (kind === "SEMI" || kind === "ANTI") {
      // Strip the "LEFT" side for SEMI/ANTI joins in DuckDB
      const side = expression.text("side").toUpperCase();
      if (side === "LEFT") {
        expression.args["side"] = "";
      }
    }
    return super.joinSql(expression);
  }

  /**
   * Check if an expression is a CAST to a floating-point type (FLOAT, REAL, DOUBLE).
   * Returns the uppercase type name if so, otherwise null.
   */
  private static getCastFloatType(expr: Expression): string | null {
    if ((expr.constructor as any).key !== "cast") return null;
    const toExpr = expr.args["to"];
    if (!toExpr) return null;
    const typeName = String(toExpr.this_ ?? "").toUpperCase();
    if (typeName === "FLOAT" || typeName === "REAL" || typeName === "FLOAT4") {
      return "REAL";
    }
    if (typeName === "DOUBLE" || typeName === "DOUBLE PRECISION" || typeName === "FLOAT8") {
      return "DOUBLE";
    }
    return null;
  }

  /**
   * Check if an expression is a CAST to a decimal type (DECIMAL, NUMERIC, NUMBER).
   */
  private static isCastDecimal(expr: Expression): boolean {
    if ((expr.constructor as any).key !== "cast") return false;
    const toExpr = expr.args["to"];
    if (!toExpr) return false;
    const typeName = String(toExpr.this_ ?? "").toUpperCase();
    return typeName === "DECIMAL" || typeName === "NUMERIC" || typeName === "NUMBER";
  }

  override anonymousSql(expression: Expression): string {
    const name = expression.this_ as string;
    const upper = (name || "").toUpperCase();
    const args = expression.expressions || [];

    // Handle functions that map to keywords (no parentheses)
    const keyword = DuckDBGenerator.FUNCTION_TO_KEYWORD[upper];
    if (keyword) {
      return keyword;
    }

    // TRY_PARSE_JSON(x) -> CASE WHEN JSON_VALID(x) THEN x ELSE NULL END
    if (upper === "TRY_PARSE_JSON" && args.length === 1) {
      const argSql = this.sql(args[0]);
      return `CASE WHEN JSON_VALID(${argSql}) THEN ${argSql} ELSE NULL END`;
    }

    // BITMAP_BUCKET_NUMBER(x) -> CASE WHEN x > 0 THEN ((x - 1) // 32768) + 1 ELSE x // 32768 END
    if (upper === "BITMAP_BUCKET_NUMBER" && args.length === 1) {
      const argSql = this.sql(args[0]);
      return `CASE WHEN ${argSql} > 0 THEN ((${argSql} - 1) // 32768) + 1 ELSE ${argSql} // 32768 END`;
    }

    // ARRAY_REMOVE(arr, val):
    //   If val is a non-NULL literal: LIST_FILTER(arr, _u -> _u <> val)
    //   Otherwise: CASE WHEN val IS NULL THEN NULL ELSE LIST_FILTER(arr, _u -> _u <> val) END
    if (upper === "ARRAY_REMOVE" && args.length === 2) {
      const arrSql = this.sql(args[0]);
      const valSql = this.sql(args[1]);
      const valKey = (args[1].constructor as any).key;
      const isLiteralNonNull = valKey === "literal";
      if (isLiteralNonNull) {
        return `LIST_FILTER(${arrSql}, _u -> _u <> ${valSql})`;
      }
      return `CASE WHEN ${valSql} IS NULL THEN NULL ELSE LIST_FILTER(${arrSql}, _u -> _u <> ${valSql}) END`;
    }

    // ARRAY_COMPACT(x) -> LIST_FILTER(x, _u -> NOT _u IS NULL)
    if (upper === "ARRAY_COMPACT" && args.length === 1) {
      const argSql = this.sql(args[0]);
      return `LIST_FILTER(${argSql}, _u -> NOT _u IS NULL)`;
    }

    // ARRAY_CONSTRUCT_COMPACT(a, b, c, ...) -> LIST_FILTER([a, b, c, ...], _u -> NOT _u IS NULL)
    if (upper === "ARRAY_CONSTRUCT_COMPACT") {
      const argsSql = args.map((a: any) => this.sql(a)).join(", ");
      return `LIST_FILTER([${argsSql}], _u -> NOT _u IS NULL)`;
    }

    // DATE(year, month, day) with 3 args -> MAKE_DATE(year, month, day)
    if (upper === "DATE" && args.length === 3) {
      return this.func("MAKE_DATE", ...args);
    }

    // FROM_UTF8(x, ...) -> DECODE(x) (drop extra args)
    if (upper === "FROM_UTF8" && args.length >= 1) {
      return this.func("DECODE", args[0]);
    }

    // ENCODE(x, charset) -> ENCODE(x) (drop charset arg in DuckDB)
    if (upper === "ENCODE" && args.length > 1) {
      return this.func("ENCODE", args[0]);
    }

    // DECODE(x, charset) -> DECODE(x) (drop charset arg in DuckDB)
    if (upper === "DECODE" && args.length > 1) {
      return this.func("DECODE", args[0]);
    }

    // LOGICAL_OR(x) -> BOOL_OR(CAST(x AS BOOLEAN))
    if (upper === "LOGICAL_OR" && args.length >= 1) {
      const argSql = this.sql(args[0]);
      return `BOOL_OR(CAST(${argSql} AS BOOLEAN))`;
    }

    // COLLECT_SET(x) -> LIST(DISTINCT x)
    if (upper === "COLLECT_SET" && args.length >= 1) {
      const argSql = this.sql(args[0]);
      return `LIST(DISTINCT ${argSql})`;
    }

    // DATE_DIFF/DATEDIFF: uppercase the first string argument (date part)
    if ((upper === "DATE_DIFF" || upper === "DATEDIFF") && args.length >= 1) {
      const firstArg = args[0];
      if (firstArg && firstArg.isString) {
        const argSqls = args.map((a: any, i: number) => {
          if (i === 0 && a.isString) {
            const text = a.this_ ?? a.name ?? "";
            return `'${String(text).toUpperCase()}'`;
          }
          return this.sql(a);
        });
        return `DATE_DIFF(${argSqls.join(", ")})`;
      }
      return this.func("DATE_DIFF", ...args);
    }

    // JSON_EXTRACT(x, path) -> x -> path
    if ((upper === "JSON_EXTRACT" || upper === "JSON_EXTRACT_PATH") && args.length === 2) {
      return `${this.sql(args[0])} -> ${this.sql(args[1])}`;
    }

    // JSON_EXTRACT_STRING(x, path) -> x ->> path
    if ((upper === "JSON_EXTRACT_STRING" || upper === "JSON_EXTRACT_PATH_TEXT") && args.length === 2) {
      return `${this.sql(args[0])} ->> ${this.sql(args[1])}`;
    }

    // BIT_OR/BIT_AND/BIT_XOR: wrap CAST(... AS FLOAT/DOUBLE) with ROUND then CAST to INT,
    // and wrap CAST(... AS DECIMAL) with CAST to INT
    if ((upper === "BIT_OR" || upper === "BIT_AND" || upper === "BIT_XOR") && args.length === 1) {
      const arg = args[0];
      const floatType = DuckDBGenerator.getCastFloatType(arg);
      if (floatType) {
        const innerSql = this.sql(arg);
        return `${this.normalizeFunc(upper)}(CAST(ROUND(${innerSql}) AS INT))`;
      }
      if (DuckDBGenerator.isCastDecimal(arg)) {
        const innerSql = this.sql(arg);
        return `${this.normalizeFunc(upper)}(CAST(${innerSql} AS INT))`;
      }
    }

    const mapped = DuckDBGenerator.FUNCTION_NAME_MAP[upper];
    if (mapped) {
      return this.func(mapped, ...args);
    }
    return this.func(
      this.sql(expression, "this"),
      ...args,
    );
  }
}

// ---------------------------------------------------------------------------
// DuckDB Dialect
// ---------------------------------------------------------------------------

export class DuckDB extends Dialect {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override NORMALIZE_FUNCTIONS: string | boolean = "upper";

  static override GeneratorClass: typeof Generator = DuckDBGenerator;
}

// Register the dialect
Dialect.register(["duckdb"], DuckDB);
