/**
 * ClickHouse dialect for sqlglot-ts.
 *
 * ClickHouse uses backtick (`) or double-quote (") for identifier quoting,
 * single quotes for strings, and has ClickHouse-specific types:
 * Int8/Int16/Int32/Int64, UInt8/UInt16/UInt32/UInt64, Float32/Float64,
 * String, Bool, DateTime, Array, Tuple, Map, etc.
 *
 * Function names are case-sensitive (NORMALIZE_FUNCTIONS = false).
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// ClickHouse Tokenizer
// ---------------------------------------------------------------------------

class ClickHouseTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ['"', "`"];
  static override QUOTES: Array<string | [string, string]> = ["'"];
  static override STRING_ESCAPES: string[] = ["'", "\\"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    "#",
    ["/*", "*/"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
    FLOAT32: TokenType.FLOAT,
    FLOAT64: TokenType.DOUBLE,
    INT8: TokenType.TINYINT,
    INT16: TokenType.SMALLINT,
    INT32: TokenType.INT,
    INT64: TokenType.BIGINT,
    UINT8: TokenType.UTINYINT,
    UINT16: TokenType.USMALLINT,
    UINT32: TokenType.UINT,
    UINT64: TokenType.UBIGINT,
    DATETIME64: TokenType.DATETIME64,
    DATE32: TokenType.DATE32,
    FIXEDSTRING: TokenType.FIXEDSTRING,
    LOWCARDINALITY: TokenType.LOWCARDINALITY,
    NESTED: TokenType.NESTED,
    TUPLE: TokenType.STRUCT,
    FINAL: TokenType.FINAL,
    GLOBAL: TokenType.GLOBAL,
  };
}

// ---------------------------------------------------------------------------
// ClickHouse Generator
// ---------------------------------------------------------------------------

class ClickHouseGenerator extends Generator {
  /**
   * Type mapping for ClickHouse-specific type names.
   */
  private static TYPE_MAP: Record<string, string> = {
    BOOL: "Bool",
    BOOLEAN: "Bool",
    TINYINT: "Int8",
    SMALLINT: "Int16",
    INT: "Int32",
    BIGINT: "Int64",
    FLOAT: "Float32",
    DOUBLE: "Float64",
    VARCHAR: "String",
    CHAR: "String",
    TEXT: "String",
    NCHAR: "String",
    NVARCHAR: "String",
    BINARY: "String",
    VARBINARY: "String",
    BLOB: "String",
    LONGBLOB: "String",
    LONGTEXT: "String",
    MEDIUMBLOB: "String",
    MEDIUMTEXT: "String",
    TINYBLOB: "String",
    TINYTEXT: "String",
    DATETIME: "DateTime",
    DATETIME2: "DateTime",
    DATETIME64: "DateTime64",
    TIMESTAMP: "DateTime",
    TIMESTAMPNTZ: "DateTime",
    TIMESTAMPTZ: "DateTime",
    SMALLDATETIME: "DateTime",
    DATE: "Date",
    DATE32: "Date32",
    DECIMAL: "Decimal",
    DECIMAL32: "Decimal32",
    DECIMAL64: "Decimal64",
    DECIMAL128: "Decimal128",
    DECIMAL256: "Decimal256",
    MEDIUMINT: "Int32",
    UBIGINT: "UInt64",
    UINT: "UInt32",
    UINT128: "UInt128",
    UINT256: "UInt256",
    USMALLINT: "UInt16",
    UTINYINT: "UInt8",
    INT128: "Int128",
    INT256: "Int256",
    FIXEDSTRING: "FixedString",
    LOWCARDINALITY: "LowCardinality",
    NESTED: "Nested",
    STRUCT: "Tuple",
    ARRAY: "Array",
    MAP: "Map",
    ENUM: "Enum",
    ENUM8: "Enum8",
    ENUM16: "Enum16",
    NOTHING: "Nothing",
    DYNAMIC: "Dynamic",
    AGGREGATEFUNCTION: "AggregateFunction",
    SIMPLEAGGREGATEFUNCTION: "SimpleAggregateFunction",
    NULLABLE: "Nullable",
    IPV4: "IPv4",
    IPV6: "IPv6",
    POINT: "Point",
    RING: "Ring",
    LINESTRING: "LineString",
    MULTILINESTRING: "MultiLineString",
    POLYGON: "Polygon",
    MULTIPOLYGON: "MultiPolygon",
  };

  /**
   * Function name mapping for ClickHouse-specific function renames.
   * Maps uppercased function names to their ClickHouse canonical forms.
   */
  private static FUNCTION_NAME_MAP: Record<string, string> = {
    // Canonical ClickHouse function names (case-sensitive)
    ISNAN: "isNaN",
    IS_NAN: "isNaN",
    STARTSWITH: "startsWith",
    STARTS_WITH: "startsWith",
    ENDSWITH: "endsWith",
    ENDS_WITH: "endsWith",
    CURRENTDATABASE: "CURRENT_DATABASE",
    CURRENTSCHEMAS: "CURRENT_SCHEMAS",
    LEVENSHTEINDISTANCE: "editDistance",
    LAG: "lagInFrame",
    LEAD: "leadInFrame",
    DATEADD: "DATE_ADD",
    DATE_ADD: "DATE_ADD",
    DATEDIFF: "DATE_DIFF",
    DATE_DIFF: "DATE_DIFF",
    DATESUB: "DATE_SUB",
    DATE_SUB: "DATE_SUB",
    ARRAYCONCAT: "arrayConcat",
    ARRAYREVERSE: "arrayReverse",
    ARRAYSLICE: "arraySlice",
    ARRAYSUM: "arraySum",
    COUNTIF: "countIf",
    COSINEDISTANCE: "cosineDistance",
    EUCLIDEANDISTANCE: "L2Distance",
    L2DISTANCE: "L2Distance",
    FARMFINGERPRINT: "farmFingerprint64",
    FARMFINGERPRINT64: "farmFingerprint64",
    JAROWINKLERSIMILARITY: "jaroWinklerSimilarity",
    NULLIF: "nullIf",
    TRUNC: "trunc",
    PARSEDATETIME: "parseDateTime",
    TODATE: "toDate",
    TOTYPENAME: "toTypeName",
    VERSION: "VERSION",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = ClickHouseGenerator.TYPE_MAP[typeValue] ?? typeValue;
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
    const mapped = ClickHouseGenerator.FUNCTION_NAME_MAP[upper];
    if (mapped) {
      return this.func(mapped, ...(expression.expressions || []));
    }
    return this.func(
      this.sql(expression, "this"),
      ...(expression.expressions || []),
    );
  }

  override currentdateSql(_expression: Expression): string {
    return "CURRENT_DATE()";
  }

  override currenttimestampSql(_expression: Expression): string {
    return "CURRENT_TIMESTAMP()";
  }
}

// ---------------------------------------------------------------------------
// ClickHouse Dialect
// ---------------------------------------------------------------------------

export class ClickHouse extends Dialect {
  static override IDENTIFIER_START = "`";
  static override IDENTIFIER_END = "`";
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";
  static override NORMALIZE_FUNCTIONS: string | boolean = false;

  static override TokenizerClass: any = ClickHouseTokenizer;
  static override GeneratorClass: typeof Generator = ClickHouseGenerator;
}

// Register the dialect
Dialect.register(["clickhouse"], ClickHouse);
