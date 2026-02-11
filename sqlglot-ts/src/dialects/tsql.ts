/**
 * T-SQL (SQL Server) dialect for sqlglot-ts.
 *
 * T-SQL uses square brackets [identifier] for identifier quoting (also supports
 * double-quotes). Strings use single quotes with quote-doubling for escapes.
 * T-SQL has its own type system with types like BIT (boolean), NVARCHAR, NCHAR,
 * DATETIME2, UNIQUEIDENTIFIER, MONEY, IMAGE, NTEXT, etc.
 *
 * T-SQL does not normalize function names by default (preserves case).
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import {
  Boolean_ as BooleanExpr,
  Null,
  Column,
  Identifier,
  EQ,
  NEQ,
  Is,
  In,
  Select,
  Alias,
  Values,
  If,
  Literal,
  Cast,
} from "../expressions.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// TSQL date unit alias mapping
// ---------------------------------------------------------------------------

/**
 * Maps TSQL date part abbreviations to their canonical form.
 * Used to normalize the first argument of DATEDIFF, DATEPART, etc.
 */
const DATE_UNIT_ALIAS: Record<string, string> = {
  YY: "YEAR",
  YYYY: "YEAR",
  Y: "DAYOFYEAR",
  MM: "MONTH",
  M: "MONTH",
  MON: "MONTH",
  MONTHS: "MONTH",
  DD: "DAY",
  D: "DAY",
  DAYS: "DAY",
  DAYOFMONTH: "DAY",
  DW: "WEEKDAY",
  WEEKDAY: "WEEKDAY",
  WK: "WEEK",
  WW: "WEEK",
  QQ: "QUARTER",
  Q: "QUARTER",
  QTR: "QUARTER",
  HH: "HOUR",
  H: "HOUR",
  HR: "HOUR",
  MI: "MINUTE",
  N: "MINUTE",
  MIN: "MINUTE",
  SS: "SECOND",
  S: "SECOND",
  SEC: "SECOND",
  MS: "MILLISECOND",
  MCS: "MICROSECOND",
  NS: "NANOSECOND",
  TZ: "TIMEZONE_MINUTE",
  TZOFFSET: "TIMEZONE_MINUTE",
  ISO_WEEK: "ISO_WEEK",
  ISOWK: "ISO_WEEK",
  ISOWW: "ISO_WEEK",
};

/**
 * Functions whose first argument is a date unit that should only be
 * alias-resolved (preserve case of canonical names).
 */
const DATE_UNIT_PRESERVE_FUNCTIONS = new Set([
  "DATEPART",
]);

// ---------------------------------------------------------------------------
// TSQL Tokenizer
// ---------------------------------------------------------------------------

class TSQLTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = [["[", "]"], '"'];
  static override QUOTES: Array<string | [string, string]> = ["'"];
  static override STRING_ESCAPES: string[] = ["'"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    ["/*", "*/"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
    DATETIME2: TokenType.DATETIME2,
    DATETIMEOFFSET: TokenType.TIMESTAMPTZ,
    IMAGE: TokenType.IMAGE,
    MONEY: TokenType.MONEY,
    NTEXT: TokenType.TEXT,
    REAL: TokenType.FLOAT,
    ROWVERSION: TokenType.ROWVERSION,
    SMALLDATETIME: TokenType.SMALLDATETIME,
    SMALLMONEY: TokenType.SMALLMONEY,
    SQL_VARIANT: TokenType.VARIANT,
    TIMESTAMP: TokenType.ROWVERSION,
    TINYINT: TokenType.UTINYINT,
    UNIQUEIDENTIFIER: TokenType.UUID,
    XML: TokenType.XML,
  };
}

// ---------------------------------------------------------------------------
// TSQL Generator
// ---------------------------------------------------------------------------

class TSQLGenerator extends Generator {
  /**
   * Type mapping from standard/internal types TO T-SQL type names.
   *
   * Based on the Python TSQL Generator TYPE_MAPPING:
   * - BOOLEAN -> BIT
   * - DOUBLE -> FLOAT
   * - INT -> INTEGER
   * - TEXT -> VARCHAR(MAX)
   * - TIMESTAMP -> DATETIME2
   * - TIMESTAMPNTZ -> DATETIME2
   * - TIMESTAMPTZ -> DATETIMEOFFSET
   * - UUID -> UNIQUEIDENTIFIER
   * - VARIANT -> SQL_VARIANT
   * - DECIMAL -> NUMERIC
   */
  private static TYPE_MAP: Record<string, string> = {
    BOOLEAN: "BIT",
    DECIMAL: "NUMERIC",
    DOUBLE: "FLOAT",
    INT: "INTEGER",
    REAL: "FLOAT",
    TEXT: "VARCHAR(MAX)",
    TIMESTAMP: "DATETIME2",
    TIMESTAMPNTZ: "DATETIME2",
    TIMESTAMPTZ: "DATETIMEOFFSET",
    UTINYINT: "TINYINT",
    UUID: "UNIQUEIDENTIFIER",
    VARIANT: "SQL_VARIANT",
    BLOB: "IMAGE",
  };

  /**
   * Types whose mapped output already contains parenthesized params
   * and should NOT have interior expressions appended.
   */
  private static COMPOUND_TYPE_MAP = new Set(["TEXT"]);

  /**
   * Function name mapping for TSQL-specific function renames.
   * Maps base/generic function names to TSQL equivalents.
   */
  private static FUNCTION_NAME_MAP: Record<string, string> = {
    STDDEV: "STDEV",
    LENGTH: "LEN",
    LOCATE: "CHARINDEX",
    LAST_DAY: "EOMONTH",
    REPEAT: "REPLICATE",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = TSQLGenerator.TYPE_MAP[typeValue] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    // For types that map to compound names (like VARCHAR(MAX)), don't add interior params
    if (TSQLGenerator.COMPOUND_TYPE_MAP.has(typeValue as string)) {
      return typeSql;
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }

  override anonymousSql(expression: Expression): string {
    const name = expression.this_ as string;
    const upper = (name || "").toUpperCase();
    const mapped = TSQLGenerator.FUNCTION_NAME_MAP[upper];
    if (mapped) {
      return this.func(mapped, ...(expression.expressions || []));
    }

    // EOMONTH: wrap first arg with CAST(... AS DATE),
    // and if there's a month offset, transform to EOMONTH(DATEADD(MONTH, offset, CAST(... AS DATE)))
    if (upper === "EOMONTH") {
      const args = expression.expressions || [];
      if (args.length >= 1) {
        const dateArg = `CAST(${this.sql(args[0])} AS DATE)`;
        if (args.length >= 2) {
          const offset = this.sql(args[1]);
          return `EOMONTH(DATEADD(MONTH, ${offset}, ${dateArg}))`;
        }
        return `EOMONTH(${dateArg})`;
      }
    }

    // TRY_CAST: parsed as Anonymous with Alias(this=expr, alias=type)
    // Map the type name through TYPE_MAP
    if (upper === "TRY_CAST") {
      const args = expression.expressions || [];
      if (args.length >= 1 && args[0] instanceof Alias) {
        const aliasExpr = args[0];
        const innerSql = this.sql(aliasExpr, "this");
        const aliasId = aliasExpr.args["alias"];
        const typeName = aliasId instanceof Identifier ? aliasId.this_ : this.sql(aliasId);
        const mappedType = typeName
          ? (TSQLGenerator.TYPE_MAP[typeName.toUpperCase()] ?? typeName)
          : typeName;
        return `TRY_CAST(${innerSql} AS ${mappedType})`;
      }
    }

    // TRY_CONVERT: map the first arg (type name) through TYPE_MAP
    if (upper === "TRY_CONVERT") {
      const args = expression.expressions || [];
      if (args.length >= 2) {
        const typeArg = args[0];
        const typeName = this._extractDateUnit(typeArg); // reuse: extracts identifier text
        const mappedType = typeName
          ? (TSQLGenerator.TYPE_MAP[typeName.toUpperCase()] ?? typeName)
          : this.sql(typeArg);
        const restArgs = args.slice(1).map((a: any) => this.sql(a));
        return `TRY_CONVERT(${mappedType}, ${restArgs.join(", ")})`;
      }
    }

    // MAKE_TIME / MAKETIME / TIME_FROM_PARTS -> TIMEFROMPARTS(h, m, s, 0, 0)
    if (upper === "MAKE_TIME" || upper === "MAKETIME" || upper === "TIME_FROM_PARTS") {
      const args = expression.expressions || [];
      const genArgs = args.map((a: any) => this.sql(a));
      // TIMEFROMPARTS requires 5 args: hour, minute, second, fractions, precision
      while (genArgs.length < 5) genArgs.push("0");
      return `TIMEFROMPARTS(${genArgs.join(", ")})`;
    }

    // TIMESTAMP_FROM_PARTS -> DATETIMEFROMPARTS(y, m, d, h, min, s, ms)
    if (upper === "TIMESTAMP_FROM_PARTS") {
      const args = expression.expressions || [];
      const genArgs = args.map((a: any) => this.sql(a));
      // DATETIMEFROMPARTS requires 7 args: year, month, day, hour, minute, seconds, milliseconds
      while (genArgs.length < 7) genArgs.push("0");
      return `DATETIMEFROMPARTS(${genArgs.join(", ")})`;
    }

    // Hash functions -> HASHBYTES('algorithm', value)
    if (upper === "SHA1" || upper === "SHA") {
      const args = expression.expressions || [];
      return `HASHBYTES('SHA1', ${this.sql(args[0])})`;
    }
    if (upper === "MD5") {
      const args = expression.expressions || [];
      return `HASHBYTES('MD5', ${this.sql(args[0])})`;
    }
    if (upper === "SHA2") {
      const args = expression.expressions || [];
      const bits = args.length > 1 ? String((args[1] as any)?.this_ ?? "256") : "256";
      return `HASHBYTES('SHA2_${bits}', ${this.sql(args[0])})`;
    }

    // DATEDIFF/DATEDIFF_BIG: normalize unit, wrap ALL date args with CAST,
    // convert integer literals to epoch-based date strings.
    // If the start_date arg is a float, skip all wrapping (identity).
    if (upper === "DATEDIFF" || upper === "DATEDIFF_BIG") {
      const args = expression.expressions || [];
      if (args.length > 0) {
        const unitArg = args[0];
        const unitText = this._extractDateUnit(unitArg);
        if (unitText) {
          const upperUnit = unitText.toUpperCase();
          const normalized = DATE_UNIT_ALIAS[upperUnit] || upperUnit;
          // Check if start_date (args[1]) is a float literal
          const startDate = args[1];
          const isFloat = startDate instanceof Literal
            && !startDate.args["is_string"]
            && String(startDate.this_ ?? "").includes(".");
          if (isFloat) {
            // Float: no CAST wrapping for any args
            const restArgs = args.slice(1).map((a: any) => this.sql(a));
            const allArgs = [normalized, ...restArgs].join(", ");
            return `${this.normalizeFunc(upper)}(${allArgs})`;
          }
          const restArgs = args.slice(1).map((a: any) => this._wrapDateDiffArg(a));
          const allArgs = [normalized, ...restArgs].join(", ");
          return `${this.normalizeFunc(upper)}(${allArgs})`;
        }
      }
    }

    // DATETRUNC: normalize unit, wrap string literal arg with CAST
    if (upper === "DATETRUNC") {
      const args = expression.expressions || [];
      if (args.length > 0) {
        const unitArg = args[0];
        const unitText = this._extractDateUnit(unitArg);
        if (unitText) {
          const upperUnit = unitText.toUpperCase();
          const normalized = DATE_UNIT_ALIAS[upperUnit] || upperUnit;
          const restArgs = args.slice(1).map((a: any) => this._wrapDateTruncArg(a));
          const allArgs = [normalized, ...restArgs].join(", ");
          return `${this.normalizeFunc(upper)}(${allArgs})`;
        }
      }
    }

    // DATENAME with month/weekday units: transform to FORMAT(CAST(... AS DATETIME2), format_str)
    if (upper === "DATENAME") {
      const args = expression.expressions || [];
      if (args.length >= 2) {
        const unitArg = args[0];
        const unitText = this._extractDateUnit(unitArg);
        if (unitText) {
          const upperUnit = unitText.toUpperCase();
          const resolvedUnit = DATE_UNIT_ALIAS[upperUnit] || upperUnit;
          // Map certain units to FORMAT calls
          const FORMAT_MAP: Record<string, string> = {
            MONTH: "MMMM",
            WEEKDAY: "dddd",
          };
          const fmt = FORMAT_MAP[resolvedUnit];
          if (fmt) {
            const dateSql = `CAST(${this.sql(args[1])} AS DATETIME2)`;
            return `FORMAT(${dateSql}, '${fmt}')`;
          }
          // Other units: emit DATENAME normally
          const restArgs = args.slice(1).map((a: any) => this.sql(a));
          const allArgs = [resolvedUnit, ...restArgs].join(", ");
          return `${this.normalizeFunc(upper)}(${allArgs})`;
        }
      }
    }

    // DATEADD: normalize unit only, no CAST wrapping
    if (upper === "DATEADD") {
      const args = expression.expressions || [];
      if (args.length > 0) {
        const unitArg = args[0];
        const unitText = this._extractDateUnit(unitArg);
        if (unitText) {
          const upperUnit = unitText.toUpperCase();
          const normalized = DATE_UNIT_ALIAS[upperUnit] || upperUnit;
          const restArgs = args.slice(1).map((a: any) => this.sql(a));
          const allArgs = [normalized, ...restArgs].join(", ");
          return `${this.normalizeFunc(upper)}(${allArgs})`;
        }
      }
    }

    // For DATEPART, only resolve aliases but preserve canonical name case
    if (DATE_UNIT_PRESERVE_FUNCTIONS.has(upper)) {
      const args = expression.expressions || [];
      if (args.length > 0) {
        const unitArg = args[0];
        const unitText = this._extractDateUnit(unitArg);
        if (unitText) {
          const upperUnit = unitText.toUpperCase();
          const alias = DATE_UNIT_ALIAS[upperUnit];
          // Only replace if it's an alias; preserve original otherwise
          const normalized = alias || unitText;
          const restArgs = args.slice(1).map((a: any) => this.sql(a));
          const allArgs = [normalized, ...restArgs].join(", ");
          return `${this.normalizeFunc(upper)}(${allArgs})`;
        }
      }
    }

    return this.func(
      this.sql(expression, "this"),
      ...(expression.expressions || []),
    );
  }

  /**
   * For DATEDIFF/DATEDIFF_BIG: wrap ALL args with CAST(... AS DATETIME2).
   * Integer literals are converted to date strings using the 1900-01-01 epoch.
   * Float literals cause early return (no wrapping of any args).
   */
  private _wrapDateDiffArg(expr: Expression): string {
    // Integer literal -> convert to epoch date
    if (expr instanceof Literal && !expr.args["is_string"]) {
      const numStr = String(expr.this_ ?? "");
      if (/^\d+$/.test(numStr)) {
        return this._intToDateCast(parseInt(numStr, 10));
      }
      // Float: don't wrap
      return this.sql(expr);
    }
    // Negative integer (Neg wrapping Literal)
    if ((expr.constructor as any).key === "neg") {
      const inner = expr.this_;
      if (inner instanceof Literal && !inner.args["is_string"]) {
        const numStr = String(inner.this_ ?? "");
        if (/^\d+$/.test(numStr)) {
          return this._intToDateCast(-parseInt(numStr, 10));
        }
        return this.sql(expr);
      }
    }
    // Skip wrapping if already a CAST expression
    if (expr instanceof Cast) {
      return this.sql(expr);
    }
    // String literal or any other expression: wrap with CAST
    return `CAST(${this.sql(expr)} AS DATETIME2)`;
  }

  /**
   * For DATETRUNC: only wrap string literals with CAST(... AS DATETIME2).
   */
  private _wrapDateTruncArg(expr: Expression): string {
    if (expr instanceof Literal && expr.args["is_string"]) {
      return `CAST(${this.sql(expr)} AS DATETIME2)`;
    }
    return this.sql(expr);
  }

  /**
   * Convert an integer to a T-SQL epoch-based date string wrapped in CAST.
   * T-SQL epoch: 0 = 1900-01-01, 1 = 1900-01-02, -1 = 1899-12-31, etc.
   */
  private _intToDateCast(days: number): string {
    const epoch = new Date(Date.UTC(1900, 0, 1));
    epoch.setUTCDate(epoch.getUTCDate() + days);
    const y = epoch.getUTCFullYear();
    const m = String(epoch.getUTCMonth() + 1).padStart(2, "0");
    const d = String(epoch.getUTCDate()).padStart(2, "0");
    return `CAST('${y}-${m}-${d}' AS DATETIME2)`;
  }

  /**
   * Extract the text of a date unit argument from an expression.
   * The date unit can be a Column wrapping an Identifier, or a bare Identifier.
   */
  private _extractDateUnit(expr: Expression): string | null {
    // Column(Identifier("month")) - unquoted identifier parsed as column
    if (expr instanceof Column) {
      const id = expr.this_;
      if (id instanceof Identifier) {
        return id.this_;
      }
    }
    // Bare Identifier
    if (expr instanceof Identifier) {
      return expr.this_;
    }
    // Check if it's a Var-like expression (key = "var")
    if ((expr.constructor as any).key === "var") {
      return String(expr.this_ ?? "");
    }
    return null;
  }

  // T-SQL supports three-part names like catalog..table (empty db).
  // Preserve the empty middle part when catalog is set but db is not.
  override tableParts(expression: Expression): string {
    const catalog = expression.args.catalog;
    const db = expression.args.db;
    const table = expression.args.this;

    if (catalog && !db && table) {
      return `${this.sql(catalog)}..${this.sql(table)}`;
    }

    return [catalog, db, table]
      .filter((p) => p != null)
      .map((p) => this.sql(p))
      .join(".");
  }

  // T-SQL doesn't support ILIKE, convert to LIKE
  override ilikeSql(expression: Expression): string {
    return this.binary(expression, "LIKE");
  }

  // T-SQL uses 1 and 0 for boolean literals in value context (BIT type),
  // but (1 = 1) / (1 = 0) in predicate context (WHERE, AND, OR, etc.)
  override booleanSql(expression: Expression): string {
    const BIT_TYPES = [EQ, NEQ, Is, In, Select, Alias];
    const parent = expression.parent;
    if (parent && BIT_TYPES.some((t) => parent instanceof t)) {
      return expression.this_ ? "1" : "0";
    }
    if (expression.findAncestor(Values)) {
      return expression.this_ ? "1" : "0";
    }
    return expression.this_ ? "(1 = 1)" : "(1 = 0)";
  }

  // T-SQL uses GETDATE() instead of CURRENT_TIMESTAMP
  override currenttimestampSql(_expression: Expression): string {
    return "GETDATE()";
  }

  // T-SQL uses GETDATE() instead of CURRENT_DATE
  override currentdateSql(_expression: Expression): string {
    return "GETDATE()";
  }

  // T-SQL uses IIF instead of IF
  override ifSql(expression: Expression): string {
    const cond = this.sql(expression, "this");
    // The parser stores args as { this, expressions } not { this, true, false }
    const exprs = expression.expressions || [];
    const trueVal = expression.args["true"]
      ? this.sql(expression, "true")
      : (exprs[0] ? this.sql(exprs[0]) : "");
    const falseVal = expression.args["false"]
      ? this.sql(expression, "false")
      : (exprs[1] ? this.sql(exprs[1]) : "");
    const parts = [cond, trueVal, falseVal].filter(Boolean);
    return `IIF(${parts.join(", ")})`;
  }

  // T-SQL doesn't support IS TRUE / IS FALSE syntax.
  // Convert to equality checks: IS TRUE -> = 1, IS FALSE -> = 0
  // Keep IS NULL / IS NOT NULL as-is.
  override isSql(expression: Expression): string {
    const rhs = expression.args["expression"];
    if (rhs instanceof BooleanExpr) {
      const thisSql = this.sql(expression, "this");
      const val = rhs.this_ ? "1" : "0";
      const isNot = expression.args["not"];
      if (isNot) {
        return `NOT ${thisSql} = ${val}`;
      }
      return `${thisSql} = ${val}`;
    }
    // IS NULL / IS NOT NULL -- use default behavior
    const not = expression.args["not"] ? " NOT" : "";
    return this.binary(expression, `IS${not}`);
  }

}

// ---------------------------------------------------------------------------
// TSQL Dialect
// ---------------------------------------------------------------------------

export class TSQL extends Dialect {
  static override IDENTIFIER_START = "[";
  static override IDENTIFIER_END = "]";
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";

  static override TokenizerClass: any = TSQLTokenizer;
  static override GeneratorClass: typeof Generator = TSQLGenerator;
}

// Register the dialect
Dialect.register(["tsql"], TSQL);
