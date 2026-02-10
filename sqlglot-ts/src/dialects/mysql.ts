/**
 * MySQL dialect for sqlglot-ts.
 *
 * MySQL uses backtick (`) for identifier quoting, single quotes for strings,
 * and has various SQL generation differences from the base "sqlglot" dialect.
 */

import { Dialect, _setExpModule, _setTokenizerModule } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Parser } from "../parser.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// MySQL Tokenizer
// ---------------------------------------------------------------------------

export class MySQLTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ["`"];
  static override QUOTES: Array<string | [string, string]> = ["'", '"'];
  static override STRING_ESCAPES: string[] = ["'", "\\"];
  static override BIT_STRINGS: Array<string | [string, string]> = [
    ["b'", "'"],
    ["B'", "'"],
    ["0b", ""],
  ];
  static override HEX_STRINGS: Array<string | [string, string]> = [
    ["x'", "'"],
    ["X'", "'"],
    ["0x", ""],
  ];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    "#",
    ["/*", "*/"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
    // MySQL-specific keyword overrides
    "DIV": TokenType.DIV,
    "SEPARATOR": TokenType.SEPARATOR,
    "ENUM": TokenType.ENUM,
    "MEDIUMINT": TokenType.MEDIUMINT,
    "MEDIUMTEXT": TokenType.MEDIUMTEXT,
    "LONGTEXT": TokenType.LONGTEXT,
    "TINYTEXT": TokenType.TINYTEXT,
    "MEDIUMBLOB": TokenType.MEDIUMBLOB,
    "LONGBLOB": TokenType.LONGBLOB,
    "TINYBLOB": TokenType.TINYBLOB,
    "START": TokenType.BEGIN,
    "SIGNED": TokenType.INT,
    "SIGNED INTEGER": TokenType.INT,
    "UNSIGNED": TokenType.UINT,
    "UNSIGNED INTEGER": TokenType.UINT,
    "YEAR": TokenType.YEAR,
    "SERIAL": TokenType.SERIAL,
    "DATETIME": TokenType.DATETIME,
    "MEMBER OF": TokenType.MEMBER_OF,
    "SOUNDS LIKE": TokenType.SOUNDS_LIKE,
    "_ARMSCII8": TokenType.INTRODUCER,
    "_ASCII": TokenType.INTRODUCER,
    "_BIG5": TokenType.INTRODUCER,
    "_BINARY": TokenType.INTRODUCER,
    "_CP1250": TokenType.INTRODUCER,
    "_CP1251": TokenType.INTRODUCER,
    "_CP1256": TokenType.INTRODUCER,
    "_CP1257": TokenType.INTRODUCER,
    "_CP850": TokenType.INTRODUCER,
    "_CP852": TokenType.INTRODUCER,
    "_CP866": TokenType.INTRODUCER,
    "_CP932": TokenType.INTRODUCER,
    "_DEC8": TokenType.INTRODUCER,
    "_EUCJPMS": TokenType.INTRODUCER,
    "_EUCKR": TokenType.INTRODUCER,
    "_GB18030": TokenType.INTRODUCER,
    "_GB2312": TokenType.INTRODUCER,
    "_GBK": TokenType.INTRODUCER,
    "_GEOSTD8": TokenType.INTRODUCER,
    "_GREEK": TokenType.INTRODUCER,
    "_HEBREW": TokenType.INTRODUCER,
    "_HP8": TokenType.INTRODUCER,
    "_KEYBCS2": TokenType.INTRODUCER,
    "_KOI8R": TokenType.INTRODUCER,
    "_KOI8U": TokenType.INTRODUCER,
    "_LATIN1": TokenType.INTRODUCER,
    "_LATIN2": TokenType.INTRODUCER,
    "_LATIN5": TokenType.INTRODUCER,
    "_LATIN7": TokenType.INTRODUCER,
    "_MACCE": TokenType.INTRODUCER,
    "_MACROMAN": TokenType.INTRODUCER,
    "_SJIS": TokenType.INTRODUCER,
    "_SWE7": TokenType.INTRODUCER,
    "_TIS620": TokenType.INTRODUCER,
    "_UCS2": TokenType.INTRODUCER,
    "_UJIS": TokenType.INTRODUCER,
    "_UTF8": TokenType.INTRODUCER,
    "_UTF16": TokenType.INTRODUCER,
    "_UTF16LE": TokenType.INTRODUCER,
    "_UTF32": TokenType.INTRODUCER,
    "_UTF8MB3": TokenType.INTRODUCER,
    "_UTF8MB4": TokenType.INTRODUCER,
  };
}

// ---------------------------------------------------------------------------
// MySQL Parser
// ---------------------------------------------------------------------------

export class MySQLParser extends Parser {
  // MySQL parser inherits all base parser behavior. We can add
  // MySQL-specific parsing overrides here in the future.
}

// ---------------------------------------------------------------------------
// MySQL Generator
// ---------------------------------------------------------------------------

export class MySQLGenerator extends Generator {
  /**
   * Type mapping for MySQL-specific type names.
   * MySQL uses CHAR for most text types in CAST, SIGNED/UNSIGNED for integer types.
   */
  private static TYPE_MAP: Record<string, string> = {
    VARCHAR: "CHAR",
    TEXT: "CHAR",
    MEDIUMTEXT: "CHAR",
    LONGTEXT: "CHAR",
    TINYTEXT: "CHAR",
    MEDIUMBLOB: "CHAR",
    LONGBLOB: "CHAR",
    TINYBLOB: "CHAR",
    MEDIUMINT: "SIGNED",
    "SIGNED INTEGER": "SIGNED",
    "UNSIGNED INTEGER": "UNSIGNED",
  };

  /**
   * Function name mapping for MySQL-specific function renames.
   * Maps base/generic function names to MySQL equivalents.
   */
  private static FUNCTION_NAME_MAP: Record<string, string> = {
    DATABASE: "SCHEMA",
    UCASE: "UPPER",
    LCASE: "LOWER",
    DAY_OF_MONTH: "DAYOFMONTH",
    DAY_OF_WEEK: "DAYOFWEEK",
    DAY_OF_YEAR: "DAYOFYEAR",
    WEEK_OF_YEAR: "WEEKOFYEAR",
    CHARACTER_LENGTH: "CHAR_LENGTH",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = MySQLGenerator.TYPE_MAP[typeValue] ?? typeValue;
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
    const mapped = MySQLGenerator.FUNCTION_NAME_MAP[upper];
    if (mapped) {
      return this.func(mapped, ...(expression.expressions || []));
    }
    return this.func(
      this.sql(expression, "this"),
      ...(expression.expressions || []),
    );
  }

  // MySQL doesn't support ILIKE, generate as LIKE instead
  override ilikeSql(expression: Expression): string {
    return this.binary(expression, "LIKE");
  }
}

// ---------------------------------------------------------------------------
// MySQL Dialect
// ---------------------------------------------------------------------------

export class MySQL extends Dialect {
  static override IDENTIFIER_START = "`";
  static override IDENTIFIER_END = "`";
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";

  static override TokenizerClass: any = MySQLTokenizer;
  static override ParserClass: typeof Parser = MySQLParser;
  static override GeneratorClass: typeof Generator = MySQLGenerator;
}

// Register the dialect
Dialect.register(["mysql"], MySQL);
