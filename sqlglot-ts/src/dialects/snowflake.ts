/**
 * Snowflake dialect for sqlglot-ts.
 *
 * Snowflake uses double-quote (") for identifier quoting, uppercase function names,
 * supports // line comments, and has Snowflake-specific type mappings
 * (STRUCT -> OBJECT, TEXT -> VARCHAR, BIGDECIMAL -> DOUBLE, etc.).
 * FLOAT is mapped to DOUBLE at the tokenizer level.
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Snowflake Tokenizer
// ---------------------------------------------------------------------------

class SnowflakeTokenizer extends Tokenizer {
  static override STRING_ESCAPES: string[] = ["\\", "'"];
  static override HEX_STRINGS: Array<string | [string, string]> = [
    ["x'", "'"],
    ["X'", "'"],
  ];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    "//",
    ["/*", "*/"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
    BYTEINT: TokenType.INT,
    FLOAT: TokenType.DOUBLE,
    MINUS: TokenType.EXCEPT,
    "NCHAR VARYING": TokenType.VARCHAR,
    SAMPLE: TokenType.TABLE_SAMPLE,
    SQL_DOUBLE: TokenType.DOUBLE,
    SQL_VARCHAR: TokenType.VARCHAR,
    TIMESTAMP_TZ: TokenType.TIMESTAMPTZ,
  };
}

// ---------------------------------------------------------------------------
// Snowflake Generator
// ---------------------------------------------------------------------------

class SnowflakeGenerator extends Generator {
  /**
   * Type mapping for Snowflake-specific type names.
   */
  private static TYPE_MAP: Record<string, string> = {
    STRUCT: "OBJECT",
    NESTED: "OBJECT",
    TEXT: "VARCHAR",
    STRING: "VARCHAR",
    BIGDECIMAL: "DOUBLE",
    FLOAT: "DOUBLE",
    BYTEINT: "INT",
    TIMESTAMP_NTZ: "TIMESTAMPNTZ",
    TIMESTAMP_LTZ: "TIMESTAMPLTZ",
    "CHAR VARYING": "VARCHAR",
    "CHARACTER VARYING": "VARCHAR",
    "NCHAR VARYING": "VARCHAR",
  };

  /**
   * DATE_PART name normalization map.
   * Maps uppercase input part names to Snowflake canonical names.
   */
  private static DATE_PART_MAP: Record<string, string> = {
    WEEKDAY_ISO: "DAYOFWEEKISO",
    DAYOFWEEK_ISO: "DAYOFWEEKISO",
    EPOCH_SECONDS: "EPOCH_SECOND",
    EPOCH_MILLISECONDS: "EPOCH_MILLISECOND",
    EPOCH_MICROSECONDS: "EPOCH_MICROSECOND",
    EPOCH_NANOSECONDS: "EPOCH_NANOSECOND",
  };

  /**
   * Date part abbreviation normalization map.
   * Maps abbreviated part names to canonical Snowflake forms.
   */
  private static DATE_PART_ABBREV_MAP: Record<string, string> = {
    Y: "YEAR", YR: "YEAR", YRS: "YEAR", YYY: "YEAR", YYYY: "YEAR", YEAR: "YEAR", YEARS: "YEAR",
    MM: "MONTH", MON: "MONTH", MONS: "MONTH", MONTH: "MONTH", MONTHS: "MONTH",
    D: "DAY", DD: "DAY", DAY: "DAY", DAYS: "DAY", DAYOFMONTH: "DAY",
    W: "WEEK", WK: "WEEK", WEEKOFYEAR: "WEEK", WOY: "WEEK", WY: "WEEK", WEEK: "WEEK",
    H: "HOUR", HH: "HOUR", HR: "HOUR", HOURS: "HOUR", HOUR: "HOUR",
    M: "MINUTE", MI: "MINUTE", MIN: "MINUTE", MINS: "MINUTE", MINUTE: "MINUTE", MINUTES: "MINUTE",
    S: "SECOND", SEC: "SECOND", SECS: "SECOND", SECOND: "SECOND", SECONDS: "SECOND",
    Q: "QUARTER", QTR: "QUARTER", QTRS: "QUARTER", QUARTER: "QUARTER", QUARTERS: "QUARTER",
    DW: "DAYOFWEEK", WEEKDAY: "DAYOFWEEK", DOW: "DAYOFWEEK", DAYOFWEEK: "DAYOFWEEK",
    DY: "DAYOFYEAR", DOY: "DAYOFYEAR", DAYOFYEAR: "DAYOFYEAR",
    NS: "NANOSECOND", NSEC: "NANOSECOND", NANOSECOND: "NANOSECOND", NANOSECONDS: "NANOSECOND",
    US: "MICROSECOND", USEC: "MICROSECOND", MICROSECOND: "MICROSECOND", MICROSECONDS: "MICROSECOND",
    MS: "MILLISECOND", MSEC: "MILLISECOND", MILLISECOND: "MILLISECOND", MILLISECONDS: "MILLISECOND",
  };

  /**
   * Function name mapping for Snowflake-specific function renames.
   * Maps base/generic function names to Snowflake equivalents.
   */
  private static FUNCTION_NAME_MAP: Record<string, string> = {
    // Aggregate / statistics renames
    VAR_SAMP: "VARIANCE",
    VAR_POP: "VARIANCE_POP",
    STDDEV_SAMP: "STDDEV",
    SKEWNESS: "SKEW",

    // Math renames
    POW: "POWER",

    // Null-handling renames
    IFNULL: "COALESCE",
    NVL: "COALESCE",

    // Numeric conversion renames
    TO_DECIMAL: "TO_NUMBER",
    TO_NUMERIC: "TO_NUMBER",
    TRY_TO_DECIMAL: "TRY_TO_NUMBER",
    TRY_TO_NUMERIC: "TRY_TO_NUMBER",

    // Date/time renames
    WEEKOFYEAR: "WEEK",
    TIMESTAMPFROMPARTS: "TIMESTAMP_FROM_PARTS",
    TIMESTAMPNTZFROMPARTS: "TIMESTAMP_FROM_PARTS",
    TIMESTAMP_NTZ_FROM_PARTS: "TIMESTAMP_FROM_PARTS",
    MAKE_TIMESTAMP: "TIMESTAMP_FROM_PARTS",

    // Similarity / approximate renames
    APPROXIMATE_JACCARD_INDEX: "APPROXIMATE_SIMILARITY",

    // String / formatting renames
    TO_VARCHAR: "TO_CHAR",
    MD5_HEX: "MD5",
    ENDS_WITH: "ENDSWITH",
    STUFF: "INSERT",

    // Timestamp / current time renames
    SYSTIMESTAMP: "CURRENT_TIMESTAMP",
    GETDATE: "CURRENT_TIMESTAMP",
    LOCALTIMESTAMP: "CURRENT_TIMESTAMP",
    TIMESTAMPADD: "DATEADD",
    TIMESTAMPDIFF: "DATEDIFF",
    TIMEDIFF: "DATEDIFF",

    // Pattern matching renames
    RLIKE: "REGEXP_LIKE",
    REGEXP_EXTRACT: "REGEXP_SUBSTR",
    REGEXP_SUBSTR_ALL: "REGEXP_EXTRACT_ALL",

    // Bitwise renames
    BIT_NOT: "BITNOT",
    BIT_AND: "BITAND",
    BIT_OR: "BITOR",
    BIT_XOR: "BITXOR",

    // Date part renames
    DAY_OF_WEEK: "DAYOFWEEKISO",
    DOW: "DAYOFWEEKISO",
    DOY: "DAYOFYEAR",

    // String/byte renames
    BYTE_LENGTH: "OCTET_LENGTH",

    // Cross-dialect renames (OTHER -> Snowflake)
    JSON_OBJECT: "OBJECT_CONSTRUCT_KEEP_NULL",
    PARSE_TIMESTAMP: "TO_TIMESTAMP",
    STRPTIME: "TO_TIMESTAMP",

    // Misc renames
    DATE: "TO_DATE",
  };

  /**
   * Functions that take a date/time format string as the last argument.
   */
  private static FORMAT_FUNCTIONS = new Set([
    "TO_DATE", "TO_TIME", "TO_TIMESTAMP", "DATE",
    "TRY_TO_DATE", "TRY_TO_TIME", "TRY_TO_TIMESTAMP",
    "TO_CHAR",
    "PARSE_TIMESTAMP", "STRPTIME",
  ]);

  /**
   * Snowflake date/time format token mapping.
   * Used by normalizeTimeFormat() to canonicalize format strings.
   * Sorted by decreasing token length (longest match first).
   */
  private static FORMAT_TOKENS: Array<[string, string]> = [
    // 4-char tokens
    ["YYYY", "yyyy"], ["yyyy", "yyyy"], ["MMMM", "mmmm"], ["mmmm", "mmmm"],
    ["HH24", "hh24"], ["hh24", "hh24"], ["HH12", "hh12"], ["hh12", "hh12"],
    // 3-char tokens
    ["MON", "mon"], ["mon", "mon"],
    // 2-char tokens
    ["YY", "yy"], ["yy", "yy"],
    ["MM", "mm"], ["mm", "mm"],
    ["DD", "DD"], ["dd", "dd"],
    ["DY", "DY"], ["dy", "dy"],
    ["HH", "HH"], ["hh", "hh"],
    ["MI", "mi"], ["mi", "mi"],
    ["SS", "ss"], ["ss", "ss"],
    ["AM", "pm"], ["am", "pm"], ["PM", "pm"], ["pm", "pm"],
    // FF with digit
    ["FF0", "ff0"], ["ff0", "ff0"],
    ["FF1", "ff1"], ["ff1", "ff1"],
    ["FF2", "ff2"], ["ff2", "ff2"],
    ["FF3", "ff3"], ["ff3", "ff3"],
    ["FF4", "ff4"], ["ff4", "ff4"],
    ["FF5", "ff5"], ["ff5", "ff5"],
    ["FF6", "ff6"], ["ff6", "ff6"],
    ["FF7", "ff7"], ["ff7", "ff7"],
    ["FF8", "ff8"], ["ff8", "ff8"],
    ["FF9", "ff9"], ["ff9", "ff9"],
    // FF without digit -> ff9
    ["FF", "ff9"], ["ff", "ff9"],
  ];

  /**
   * Strftime (C/Python) format token mapping to Snowflake canonical format.
   * Used for cross-dialect transpilation (e.g., BigQuery's PARSE_TIMESTAMP).
   */
  private static STRFTIME_MAP: Record<string, string> = {
    "%Y": "yyyy", "%y": "yy",
    "%m": "mm", "%B": "mmmm", "%b": "mon",
    "%d": "DD", "%j": "DDD",
    "%H": "hh24", "%I": "hh12",
    "%M": "mi", "%S": "ss",
    "%p": "pm",
    "%f": "ff6",
    "%-d": "DD", "%-m": "mm", "%-H": "hh24", "%-I": "hh12", "%-M": "mi", "%-S": "ss",
  };

  /**
   * Check if a format string uses strftime-style tokens (%X).
   */
  private static isStrftimeFormat(fmt: string): boolean {
    return fmt.includes("%");
  }

  /**
   * Convert strftime format to Snowflake format.
   */
  private static convertStrftimeFormat(fmt: string): string {
    let result = fmt;
    // Sort by key length descending to match longer tokens first (e.g., %-d before %d)
    const entries = Object.entries(SnowflakeGenerator.STRFTIME_MAP).sort((a, b) => b[0].length - a[0].length);
    for (const [token, replacement] of entries) {
      result = result.split(token).join(replacement);
    }
    return result;
  }

  /**
   * Normalize a Snowflake date/time format string to canonical form.
   * Handles quoted strings (like "T") and format tokens.
   */
  private static normalizeTimeFormat(fmt: string): string {
    let result = "";
    let i = 0;
    while (i < fmt.length) {
      // Handle double-quoted literals: "T" -> T
      if (fmt[i] === '"') {
        const end = fmt.indexOf('"', i + 1);
        if (end >= 0) {
          result += fmt.substring(i + 1, end);
          i = end + 1;
          continue;
        }
      }
      // Try to match a format token (longest match first)
      let matched = false;
      for (const [token, replacement] of SnowflakeGenerator.FORMAT_TOKENS) {
        if (fmt.substring(i, i + token.length) === token) {
          result += replacement;
          i += token.length;
          matched = true;
          break;
        }
      }
      if (!matched) {
        result += fmt[i];
        i++;
      }
    }
    return result;
  }

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = SnowflakeGenerator.TYPE_MAP[typeValue] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
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
    const args = expression.expressions || [];

    // TRY_CAST/CAST parsed as Anonymous: apply TYPE_MAP to the type alias
    if ((upper === "TRY_CAST" || upper === "CAST") && args.length === 1) {
      const arg = args[0];
      const argKey = (arg.constructor as any).key;
      if (argKey === "alias") {
        const thisSql = this.sql(arg, "this");
        const aliasName = String(arg.args?.["alias"]?.this_ ?? arg.args?.["alias"] ?? "");
        const mappedType = SnowflakeGenerator.TYPE_MAP[aliasName.toUpperCase()] ?? aliasName;
        return `${upper}(${thisSql} AS ${mappedType})`;
      }
    }

    // SQUARE(x) -> POWER(x, 2)
    if (upper === "SQUARE" && args.length >= 1) {
      return `POWER(${this.sql(args[0])}, 2)`;
    }

    // SPACE(n) -> REPEAT(' ', n)
    if (upper === "SPACE" && args.length >= 1) {
      return `REPEAT(' ', ${this.sql(args[0])})`;
    }

    // MOD(x, y) -> x % y
    if (upper === "MOD" && args.length === 2) {
      return `${this.sql(args[0])} % ${this.sql(args[1])}`;
    }

    // DIV0(a, b) -> IFF(b = 0 AND NOT a IS NULL, 0, a / b)
    if (upper === "DIV0" && args.length === 2) {
      const a = this.sql(args[0]);
      const b = this.sql(args[1]);
      const aWrap = args.length > 0 && this._needsParens(args[0]) ? `(${a})` : a;
      const bWrap = args.length > 1 && this._needsParens(args[1]) ? `(${b})` : b;
      return `IFF(${bWrap} = 0 AND NOT ${aWrap} IS NULL, 0, ${aWrap} / ${bWrap})`;
    }

    // DIV0NULL(a, b) -> IFF(b = 0 OR b IS NULL, 0, a / b)
    if (upper === "DIV0NULL" && args.length === 2) {
      const a = this.sql(args[0]);
      const b = this.sql(args[1]);
      const aWrap = this._needsParens(args[0]) ? `(${a})` : a;
      const bWrap = this._needsParens(args[1]) ? `(${b})` : b;
      return `IFF(${bWrap} = 0 OR ${bWrap} IS NULL, 0, ${aWrap} / ${bWrap})`;
    }

    // ZEROIFNULL(a) -> IFF(a IS NULL, 0, a)
    if (upper === "ZEROIFNULL" && args.length >= 1) {
      const a = this.sql(args[0]);
      return `IFF(${a} IS NULL, 0, ${a})`;
    }

    // NULLIFZERO(a) -> IFF(a = 0, NULL, a)
    if (upper === "NULLIFZERO" && args.length >= 1) {
      const a = this.sql(args[0]);
      return `IFF(${a} = 0, NULL, ${a})`;
    }

    // ARRAY_CONSTRUCT(...) -> [...]
    if (upper === "ARRAY_CONSTRUCT") {
      const inner = args.map((a: any) => this.sql(a)).join(", ");
      return `[${inner}]`;
    }

    // REGEXP_REPLACE(a, b) -> REGEXP_REPLACE(a, b, '') (add default 3rd arg)
    if (upper === "REGEXP_REPLACE" && args.length === 2) {
      return this.func("REGEXP_REPLACE", args[0], args[1], "''");
    }

    // REPLACE(a, b) -> REPLACE(a, b, '') (add default 3rd arg)
    if (upper === "REPLACE" && args.length === 2) {
      return this.func("REPLACE", args[0], args[1], "''");
    }

    // APPROX_TOP_K(x) -> APPROX_TOP_K(x, 1) (add default 2nd arg)
    if (upper === "APPROX_TOP_K" && args.length === 1) {
      return this.func("APPROX_TOP_K", args[0], "1");
    }

    // STRTOK(x) -> SPLIT_PART(x, ' ', 1), STRTOK(x, d) -> SPLIT_PART(x, d, 1)
    if (upper === "STRTOK") {
      if (args.length === 1) {
        return `SPLIT_PART(${this.sql(args[0])}, ' ', 1)`;
      }
      if (args.length === 2) {
        return `SPLIT_PART(${this.sql(args[0])}, ${this.sql(args[1])}, 1)`;
      }
      if (args.length >= 3) {
        return this.func("SPLIT_PART", args[0], args[1], args[2]);
      }
    }

    // DATEADD / DATEDIFF / DATE_TRUNC: normalize date part abbreviation in first arg
    if ((upper === "DATEADD" || upper === "DATEDIFF" || upper === "DATE_TRUNC") && args.length >= 2) {
      const partExpr = args[0];
      const partKey = (partExpr.constructor as any).key;
      if (partKey === "column" || partKey === "var") {
        const partName = partKey === "column"
          ? String(partExpr.this_?.this_ ?? partExpr.this_ ?? "")
          : String(partExpr.this_ ?? "");
        const upperPartName = partName.toUpperCase();
        const mapped = SnowflakeGenerator.DATE_PART_ABBREV_MAP[upperPartName];
        // Only apply when the input is an actual abbreviation (not already canonical)
        if (mapped && mapped !== upperPartName) {
          const restArgs = args.slice(1).map((a: any) => this.sql(a));
          if (upper === "DATE_TRUNC") {
            return `DATE_TRUNC('${mapped}', ${restArgs.join(", ")})`;
          }
          return `${upper}(${mapped}, ${restArgs.join(", ")})`;
        }
      }
    }

    // TRY_TO_TIME('literal') with single string literal arg -> TRY_CAST('literal' AS TIME)
    if (upper === "TRY_TO_TIME" && args.length === 1 && args[0].isString) {
      return `TRY_CAST(${this.sql(args[0])} AS TIME)`;
    }

    // TRY_TO_TIMESTAMP('literal') with single string literal arg -> TRY_CAST('literal' AS TIMESTAMP)
    if (upper === "TRY_TO_TIMESTAMP" && args.length === 1 && args[0].isString) {
      return `TRY_CAST(${this.sql(args[0])} AS TIMESTAMP)`;
    }

    // TRY_TO_DATE('literal') with single string literal arg -> TRY_CAST('literal' AS DATE)
    if (upper === "TRY_TO_DATE" && args.length === 1 && args[0].isString) {
      return `TRY_CAST(${this.sql(args[0])} AS DATE)`;
    }

    // TO_TIME('literal') with single string literal arg -> CAST('literal' AS TIME)
    if (upper === "TO_TIME" && args.length === 1 && args[0].isString) {
      return `CAST(${this.sql(args[0])} AS TIME)`;
    }

    // TO_DATE('literal') / DATE('literal') with single string literal arg -> CAST('literal' AS DATE)
    if ((upper === "TO_DATE" || upper === "DATE") && args.length === 1 && args[0].isString) {
      return `CAST(${this.sql(args[0])} AS DATE)`;
    }

    // Functions with date/time format strings: normalize the format arg
    if (SnowflakeGenerator.FORMAT_FUNCTIONS.has(upper) && args.length >= 2) {
      // Determine which arg is the format string: last arg for most functions,
      // first arg for PARSE_TIMESTAMP (BigQuery style: format, value)
      let fmtIdx = args.length - 1;
      if (upper === "PARSE_TIMESTAMP") {
        fmtIdx = 0;
      }
      const fmtArg = args[fmtIdx];
      if (fmtArg && fmtArg.isString) {
        const rawFmt = String(fmtArg.this_ ?? fmtArg.args?.["this"] ?? "");
        const normalized = SnowflakeGenerator.isStrftimeFormat(rawFmt)
          ? SnowflakeGenerator.convertStrftimeFormat(rawFmt)
          : SnowflakeGenerator.normalizeTimeFormat(rawFmt);
        const funcName = upper === "DATE" ? "TO_DATE" : (SnowflakeGenerator.FUNCTION_NAME_MAP[upper] ?? upper);
        // For PARSE_TIMESTAMP: swap arg order (format, value) -> (value, format)
        if (upper === "PARSE_TIMESTAMP") {
          const valueSql = args.slice(1).map((a: any) => this.sql(a)).join(", ");
          return `${funcName}(${valueSql}, '${normalized}')`;
        }
        const otherArgs = args.slice(0, args.length - 1).map((a: any) => this.sql(a));
        return `${funcName}(${otherArgs.join(", ")}, '${normalized}')`;
      }
    }

    // DATE_PART(part, expr) -> normalize part name
    if (upper === "DATE_PART" && args.length === 2) {
      const partExpr = args[0];
      const partKey = (partExpr.constructor as any).key;
      if (partKey === "column" || partKey === "var") {
        const partName = partKey === "column"
          ? (partExpr.this_?.this_ ?? partExpr.this_ ?? "")
          : (partExpr.this_ ?? "");
        const partStr = String(partName);
        const upperPart = partStr.toUpperCase();
        // Check DATE_PART_MAP first (for epoch_*, weekday_iso, etc.)
        const mapped = SnowflakeGenerator.DATE_PART_MAP[upperPart];
        if (mapped) {
          return `DATE_PART(${mapped}, ${this.sql(args[1])})`;
        }
        // Check DATE_PART_ABBREV_MAP only for actual abbreviations
        // (skip when the input already matches the canonical form, preserving original case)
        const abbrevMapped = SnowflakeGenerator.DATE_PART_ABBREV_MAP[upperPart];
        if (abbrevMapped && abbrevMapped !== upperPart) {
          return `DATE_PART(${abbrevMapped}, ${this.sql(args[1])})`;
        }
        // Uppercase the part if it has a known prefix pattern like epoch_*
        if (upperPart !== partStr && upperPart.startsWith("EPOCH_")) {
          return `DATE_PART(${upperPart}, ${this.sql(args[1])})`;
        }
      }
      return this.func("DATE_PART", ...args);
    }

    // STRUCT(val AS key, ...) -> OBJECT_CONSTRUCT('key', val, ...)
    if (upper === "STRUCT") {
      const pairs: string[] = [];
      for (const arg of args) {
        const argKey = (arg.constructor as any).key;
        if (argKey === "alias") {
          const aliasName = String(arg.args?.["alias"]?.this_ ?? arg.args?.["alias"] ?? "");
          const valSql = this.sql(arg, "this");
          pairs.push(`'${aliasName}', ${valSql}`);
        } else {
          pairs.push(this.sql(arg));
        }
      }
      return `OBJECT_CONSTRUCT(${pairs.join(", ")})`;
    }

    // SEQUENCE(start, end) -> ARRAY_GENERATE_RANGE(start, end + 1) (Presto SEQUENCE is inclusive)
    if (upper === "SEQUENCE" && args.length === 2) {
      const startSql = this.sql(args[0]);
      const endSql = this.sql(args[1]);
      return `ARRAY_GENERATE_RANGE(${startSql}, ${endSql} + 1)`;
    }

    // REGEXP_EXTRACT(subject, pattern[, group]) -> REGEXP_SUBSTR(subject, pattern, 1, 1, 'c', group)
    // Only expand when the original function name is REGEXP_EXTRACT (from other dialects),
    // not when it's already REGEXP_SUBSTR (from Snowflake identity).
    if (upper === "REGEXP_EXTRACT" && args.length >= 2 && args.length <= 3) {
      const subject = this.sql(args[0]);
      const pattern = this.sql(args[1]);
      const group = args.length >= 3 ? this.sql(args[2]) : "1";
      return `REGEXP_SUBSTR(${subject}, ${pattern}, 1, 1, 'c', ${group})`;
    }

    const mapped = SnowflakeGenerator.FUNCTION_NAME_MAP[upper];
    if (mapped) {
      return this.func(mapped, ...args);
    }
    return this.func(
      this.sql(expression, "this"),
      ...args,
    );
  }

  /**
   * Check if an expression needs parentheses when used in a binary context.
   * This is true for expressions that are themselves binary operations (Add, Sub, etc.).
   */
  private _needsParens(expr: any): boolean {
    if (!expr) return false;
    const key = (expr.constructor as any).key as string;
    return key === "add" || key === "sub" || key === "mul" || key === "div" || key === "mod";
  }

  override currenttimeSql(expression: Expression): string {
    const thisVal = this.sql(expression, "this");
    if (thisVal) return `CURRENT_TIME(${thisVal})`;
    return "CURRENT_TIME";
  }

  override currenttimestampSql(expression: Expression): string {
    const zone = this.sql(expression, "this");
    if (zone) return `CURRENT_TIMESTAMP AT TIME ZONE ${zone}`;
    return "CURRENT_TIMESTAMP()";
  }

  override castSql(expression: Expression): string {
    const toExpr = expression.args["to"];
    if (toExpr) {
      const typeValue =
        typeof toExpr.this_ === "string" ? toExpr.this_ : String(toExpr.this_ ?? "");
      if (typeValue === "GEOGRAPHY") {
        return this.func("TO_GEOGRAPHY", expression.this_);
      }
      if (typeValue === "GEOMETRY") {
        return this.func("TO_GEOMETRY", expression.this_);
      }
    }
    const thisSql = this.sql(expression, "this");
    // Apply TYPE_MAP to the target type
    const toSql = this.sql(expression, "to");
    return `CAST(${thisSql} AS ${toSql})`;
  }
}

// ---------------------------------------------------------------------------
// Snowflake Dialect
// ---------------------------------------------------------------------------

export class Snowflake extends Dialect {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override NORMALIZE_FUNCTIONS: string | boolean = "upper";

  static override TokenizerClass: any = SnowflakeTokenizer;
  static override GeneratorClass: typeof Generator = SnowflakeGenerator;
}

// Register the dialect
Dialect.register(["snowflake"], Snowflake);
