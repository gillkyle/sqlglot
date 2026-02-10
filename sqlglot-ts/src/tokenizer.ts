import { TokenType, Token } from "./tokens.js";
import { TrieResult, newTrie, inTrie, type Trie } from "./trie.js";
import { TokenError } from "./errors.js";

/**
 * Dialect-level settings that the tokenizer reads at runtime.
 * These correspond to class-level attributes on the Python Dialect class.
 */
export interface DialectSettings {
  UNESCAPED_SEQUENCES: Record<string, string>;
  IDENTIFIERS_CAN_START_WITH_DIGIT: boolean;
  NUMBERS_CAN_BE_UNDERSCORE_SEPARATED: boolean;
}

const DEFAULT_DIALECT_SETTINGS: DialectSettings = {
  UNESCAPED_SEQUENCES: {},
  IDENTIFIERS_CAN_START_WITH_DIGIT: false,
  NUMBERS_CAN_BE_UNDERSCORE_SEPARATED: false,
};

type QuoteSpec = string | [string, string];

function convertQuotes(arr: QuoteSpec[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of arr) {
    if (typeof item === "string") {
      result[item] = item;
    } else {
      result[item[0]] = item[1];
    }
  }
  return result;
}

function quotesToFormat(
  tokenType: TokenType,
  arr: QuoteSpec[],
): Record<string, [string, TokenType]> {
  const converted = convertQuotes(arr);
  const result: Record<string, [string, TokenType]> = {};
  for (const [k, v] of Object.entries(converted)) {
    result[k] = [v, tokenType];
  }
  return result;
}

function isAlnum(ch: string): boolean {
  if (ch.length !== 1) return false;
  const code = ch.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) // a-z
  );
}

function isDigit(ch: string): boolean {
  if (ch.length !== 1) return false;
  const code = ch.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v";
}

/**
 * Check if a character is a valid identifier start/continuation character.
 * Python's str.isidentifier() is broader (includes unicode letters, underscore, etc.)
 * This approximation covers ASCII letters, digits, underscore, and basic unicode letters.
 */
function isIdentifierChar(ch: string): boolean {
  if (ch.length !== 1) return false;
  const code = ch.charCodeAt(0);
  // underscore, ASCII letters, digits
  if (code === 95) return true; // _
  if (code >= 48 && code <= 57) return true; // 0-9
  if (code >= 65 && code <= 90) return true; // A-Z
  if (code >= 97 && code <= 122) return true; // a-z
  // Basic unicode identifier chars (simplified)
  if (code >= 128) return true;
  return false;
}

export class Tokenizer {
  // -------------------------------------------------------------------
  // Static config (dialect subclasses override these)
  // -------------------------------------------------------------------

  static SINGLE_TOKENS: Record<string, TokenType> = {
    "(": TokenType.L_PAREN,
    ")": TokenType.R_PAREN,
    "[": TokenType.L_BRACKET,
    "]": TokenType.R_BRACKET,
    "{": TokenType.L_BRACE,
    "}": TokenType.R_BRACE,
    "&": TokenType.AMP,
    "^": TokenType.CARET,
    ":": TokenType.COLON,
    ",": TokenType.COMMA,
    ".": TokenType.DOT,
    "-": TokenType.DASH,
    "=": TokenType.EQ,
    ">": TokenType.GT,
    "<": TokenType.LT,
    "%": TokenType.MOD,
    "!": TokenType.NOT,
    "|": TokenType.PIPE,
    "+": TokenType.PLUS,
    ";": TokenType.SEMICOLON,
    "/": TokenType.SLASH,
    "\\": TokenType.BACKSLASH,
    "*": TokenType.STAR,
    "~": TokenType.TILDE,
    "?": TokenType.PLACEHOLDER,
    "@": TokenType.PARAMETER,
    "#": TokenType.HASH,
    "'": TokenType.UNKNOWN,
    "`": TokenType.UNKNOWN,
    '"': TokenType.UNKNOWN,
  };

  static BIT_STRINGS: QuoteSpec[] = [];
  static BYTE_STRINGS: QuoteSpec[] = [];
  static HEX_STRINGS: QuoteSpec[] = [];
  static RAW_STRINGS: QuoteSpec[] = [];
  static HEREDOC_STRINGS: QuoteSpec[] = [];
  static UNICODE_STRINGS: QuoteSpec[] = [];
  static IDENTIFIERS: QuoteSpec[] = ['"'];
  static QUOTES: QuoteSpec[] = ["'"];
  static STRING_ESCAPES: string[] = ["'"];
  static BYTE_STRING_ESCAPES: string[] = [];
  static VAR_SINGLE_TOKENS: Set<string> = new Set();
  static ESCAPE_FOLLOW_CHARS: string[] = [];
  static IDENTIFIER_ESCAPES: string[] = [];

  static HEREDOC_TAG_IS_IDENTIFIER = false;
  static HEREDOC_STRING_ALTERNATIVE: TokenType = TokenType.VAR;
  static STRING_ESCAPES_ALLOWED_IN_RAW_STRINGS = true;
  static NESTED_COMMENTS = true;
  static HINT_START = "/*+";
  static TOKENS_PRECEDING_HINT: Set<TokenType> = new Set([
    TokenType.SELECT,
    TokenType.INSERT,
    TokenType.UPDATE,
    TokenType.DELETE,
  ]);

  static KEYWORDS: Record<string, TokenType> = {
    // Jinja block tokens
    "{%": TokenType.BLOCK_START,
    "{%+": TokenType.BLOCK_START,
    "{%-": TokenType.BLOCK_START,
    "%}": TokenType.BLOCK_END,
    "+%}": TokenType.BLOCK_END,
    "-%}": TokenType.BLOCK_END,
    "{{+": TokenType.BLOCK_START,
    "{{-": TokenType.BLOCK_START,
    "+}}": TokenType.BLOCK_END,
    "-}}": TokenType.BLOCK_END,

    "/*+": TokenType.HINT,

    // Operators
    "&<": TokenType.AMP_LT,
    "&>": TokenType.AMP_GT,
    "==": TokenType.EQ,
    "::": TokenType.DCOLON,
    "?::": TokenType.QDCOLON,
    "||": TokenType.DPIPE,
    "|>": TokenType.PIPE_GT,
    ">=": TokenType.GTE,
    "<=": TokenType.LTE,
    "<>": TokenType.NEQ,
    "!=": TokenType.NEQ,
    ":=": TokenType.COLON_EQ,
    "<=>": TokenType.NULLSAFE_EQ,
    "->": TokenType.ARROW,
    "->>": TokenType.DARROW,
    "=>": TokenType.FARROW,
    "#>": TokenType.HASH_ARROW,
    "#>>": TokenType.DHASH_ARROW,
    "<->": TokenType.LR_ARROW,
    "&&": TokenType.DAMP,
    "??": TokenType.DQMARK,
    "~~~": TokenType.GLOB,
    "~~": TokenType.LIKE,
    "~~*": TokenType.ILIKE,
    "~*": TokenType.IRLIKE,
    "-|-": TokenType.ADJACENT,

    // SQL Keywords
    "ALL": TokenType.ALL,
    "AND": TokenType.AND,
    "ANTI": TokenType.ANTI,
    "ANY": TokenType.ANY,
    "ASC": TokenType.ASC,
    "AS": TokenType.ALIAS,
    "ASOF": TokenType.ASOF,
    "AUTOINCREMENT": TokenType.AUTO_INCREMENT,
    "AUTO_INCREMENT": TokenType.AUTO_INCREMENT,
    "BEGIN": TokenType.BEGIN,
    "BETWEEN": TokenType.BETWEEN,
    "CACHE": TokenType.CACHE,
    "UNCACHE": TokenType.UNCACHE,
    "CASE": TokenType.CASE,
    "CHARACTER SET": TokenType.CHARACTER_SET,
    "CLUSTER BY": TokenType.CLUSTER_BY,
    "COLLATE": TokenType.COLLATE,
    "COLUMN": TokenType.COLUMN,
    "COMMIT": TokenType.COMMIT,
    "CONNECT BY": TokenType.CONNECT_BY,
    "CONSTRAINT": TokenType.CONSTRAINT,
    "COPY": TokenType.COPY,
    "CREATE": TokenType.CREATE,
    "CROSS": TokenType.CROSS,
    "CUBE": TokenType.CUBE,
    "CURRENT_DATE": TokenType.CURRENT_DATE,
    "CURRENT_SCHEMA": TokenType.CURRENT_SCHEMA,
    "CURRENT_TIME": TokenType.CURRENT_TIME,
    "CURRENT_TIMESTAMP": TokenType.CURRENT_TIMESTAMP,
    "CURRENT_USER": TokenType.CURRENT_USER,
    "CURRENT_CATALOG": TokenType.CURRENT_CATALOG,
    "DATABASE": TokenType.DATABASE,
    "DEFAULT": TokenType.DEFAULT,
    "DELETE": TokenType.DELETE,
    "DESC": TokenType.DESC,
    "DESCRIBE": TokenType.DESCRIBE,
    "DISTINCT": TokenType.DISTINCT,
    "DISTRIBUTE BY": TokenType.DISTRIBUTE_BY,
    "DIV": TokenType.DIV,
    "DROP": TokenType.DROP,
    "ELSE": TokenType.ELSE,
    "END": TokenType.END,
    "ENUM": TokenType.ENUM,
    "ESCAPE": TokenType.ESCAPE,
    "EXCEPT": TokenType.EXCEPT,
    "EXECUTE": TokenType.EXECUTE,
    "EXISTS": TokenType.EXISTS,
    "FALSE": TokenType.FALSE,
    "FETCH": TokenType.FETCH,
    "FILTER": TokenType.FILTER,
    "FILE": TokenType.FILE,
    "FIRST": TokenType.FIRST,
    "FULL": TokenType.FULL,
    "FUNCTION": TokenType.FUNCTION,
    "FOR": TokenType.FOR,
    "FOREIGN KEY": TokenType.FOREIGN_KEY,
    "FORMAT": TokenType.FORMAT,
    "FROM": TokenType.FROM,
    "GEOGRAPHY": TokenType.GEOGRAPHY,
    "GEOMETRY": TokenType.GEOMETRY,
    "GLOB": TokenType.GLOB,
    "GROUP BY": TokenType.GROUP_BY,
    "GROUPING SETS": TokenType.GROUPING_SETS,
    "HAVING": TokenType.HAVING,
    "ILIKE": TokenType.ILIKE,
    "IN": TokenType.IN,
    "INDEX": TokenType.INDEX,
    "INET": TokenType.INET,
    "INNER": TokenType.INNER,
    "INSERT": TokenType.INSERT,
    "INTERVAL": TokenType.INTERVAL,
    "INTERSECT": TokenType.INTERSECT,
    "INTO": TokenType.INTO,
    "IS": TokenType.IS,
    "ISNULL": TokenType.ISNULL,
    "JOIN": TokenType.JOIN,
    "KEEP": TokenType.KEEP,
    "KILL": TokenType.KILL,
    "LATERAL": TokenType.LATERAL,
    "LEFT": TokenType.LEFT,
    "LIKE": TokenType.LIKE,
    "LIMIT": TokenType.LIMIT,
    "LOAD": TokenType.LOAD,
    "LOCALTIME": TokenType.LOCALTIME,
    "LOCALTIMESTAMP": TokenType.LOCALTIMESTAMP,
    "LOCK": TokenType.LOCK,
    "MERGE": TokenType.MERGE,
    "NAMESPACE": TokenType.NAMESPACE,
    "NATURAL": TokenType.NATURAL,
    "NEXT": TokenType.NEXT,
    "NOT": TokenType.NOT,
    "NOTNULL": TokenType.NOTNULL,
    "NULL": TokenType.NULL,
    "OBJECT": TokenType.OBJECT,
    "OFFSET": TokenType.OFFSET,
    "ON": TokenType.ON,
    "OR": TokenType.OR,
    "XOR": TokenType.XOR,
    "ORDER BY": TokenType.ORDER_BY,
    "ORDINALITY": TokenType.ORDINALITY,
    "OUT": TokenType.OUT,
    "OUTER": TokenType.OUTER,
    "OVER": TokenType.OVER,
    "OVERLAPS": TokenType.OVERLAPS,
    "OVERWRITE": TokenType.OVERWRITE,
    "PARTITION": TokenType.PARTITION,
    "PARTITION BY": TokenType.PARTITION_BY,
    "PARTITIONED BY": TokenType.PARTITION_BY,
    "PARTITIONED_BY": TokenType.PARTITION_BY,
    "PERCENT": TokenType.PERCENT,
    "PIVOT": TokenType.PIVOT,
    "PRAGMA": TokenType.PRAGMA,
    "PRIMARY KEY": TokenType.PRIMARY_KEY,
    "PROCEDURE": TokenType.PROCEDURE,
    "OPERATOR": TokenType.OPERATOR,
    "QUALIFY": TokenType.QUALIFY,
    "RANGE": TokenType.RANGE,
    "RECURSIVE": TokenType.RECURSIVE,
    "REGEXP": TokenType.RLIKE,
    "RENAME": TokenType.RENAME,
    "REPLACE": TokenType.REPLACE,
    "RETURNING": TokenType.RETURNING,
    "REFERENCES": TokenType.REFERENCES,
    "RIGHT": TokenType.RIGHT,
    "RLIKE": TokenType.RLIKE,
    "ROLLBACK": TokenType.ROLLBACK,
    "ROLLUP": TokenType.ROLLUP,
    "ROW": TokenType.ROW,
    "ROWS": TokenType.ROWS,
    "SCHEMA": TokenType.SCHEMA,
    "SELECT": TokenType.SELECT,
    "SEMI": TokenType.SEMI,
    "SESSION": TokenType.SESSION,
    "SESSION_USER": TokenType.SESSION_USER,
    "SET": TokenType.SET,
    "SETTINGS": TokenType.SETTINGS,
    "SHOW": TokenType.SHOW,
    "SIMILAR TO": TokenType.SIMILAR_TO,
    "SOME": TokenType.SOME,
    "SORT BY": TokenType.SORT_BY,
    "START WITH": TokenType.START_WITH,
    "STRAIGHT_JOIN": TokenType.STRAIGHT_JOIN,
    "TABLE": TokenType.TABLE,
    "TABLESAMPLE": TokenType.TABLE_SAMPLE,
    "TEMP": TokenType.TEMPORARY,
    "TEMPORARY": TokenType.TEMPORARY,
    "THEN": TokenType.THEN,
    "TRUE": TokenType.TRUE,
    "TRUNCATE": TokenType.TRUNCATE,
    "UNION": TokenType.UNION,
    "UNKNOWN": TokenType.UNKNOWN,
    "UNNEST": TokenType.UNNEST,
    "UNPIVOT": TokenType.UNPIVOT,
    "UPDATE": TokenType.UPDATE,
    "USE": TokenType.USE,
    "USING": TokenType.USING,
    "UUID": TokenType.UUID,
    "VALUES": TokenType.VALUES,
    "VIEW": TokenType.VIEW,
    "VOLATILE": TokenType.VOLATILE,
    "WHEN": TokenType.WHEN,
    "WHERE": TokenType.WHERE,
    "WINDOW": TokenType.WINDOW,
    "WITH": TokenType.WITH,
    "APPLY": TokenType.APPLY,
    "ARRAY": TokenType.ARRAY,
    "BIT": TokenType.BIT,
    "BOOL": TokenType.BOOLEAN,
    "BOOLEAN": TokenType.BOOLEAN,
    "BYTE": TokenType.TINYINT,
    "MEDIUMINT": TokenType.MEDIUMINT,
    "INT1": TokenType.TINYINT,
    "TINYINT": TokenType.TINYINT,
    "INT16": TokenType.SMALLINT,
    "SHORT": TokenType.SMALLINT,
    "SMALLINT": TokenType.SMALLINT,
    "HUGEINT": TokenType.INT128,
    "UHUGEINT": TokenType.UINT128,
    "INT2": TokenType.SMALLINT,
    "INTEGER": TokenType.INT,
    "INT": TokenType.INT,
    "INT4": TokenType.INT,
    "INT32": TokenType.INT,
    "INT64": TokenType.BIGINT,
    "INT128": TokenType.INT128,
    "INT256": TokenType.INT256,
    "LONG": TokenType.BIGINT,
    "BIGINT": TokenType.BIGINT,
    "INT8": TokenType.TINYINT,
    "UINT": TokenType.UINT,
    "UINT128": TokenType.UINT128,
    "UINT256": TokenType.UINT256,
    "DEC": TokenType.DECIMAL,
    "DECIMAL": TokenType.DECIMAL,
    "DECIMAL32": TokenType.DECIMAL32,
    "DECIMAL64": TokenType.DECIMAL64,
    "DECIMAL128": TokenType.DECIMAL128,
    "DECIMAL256": TokenType.DECIMAL256,
    "DECFLOAT": TokenType.DECFLOAT,
    "BIGDECIMAL": TokenType.BIGDECIMAL,
    "BIGNUMERIC": TokenType.BIGDECIMAL,
    "BIGNUM": TokenType.BIGNUM,
    "LIST": TokenType.LIST,
    "MAP": TokenType.MAP,
    "NULLABLE": TokenType.NULLABLE,
    "NUMBER": TokenType.DECIMAL,
    "NUMERIC": TokenType.DECIMAL,
    "FIXED": TokenType.DECIMAL,
    "REAL": TokenType.FLOAT,
    "FLOAT": TokenType.FLOAT,
    "FLOAT4": TokenType.FLOAT,
    "FLOAT8": TokenType.DOUBLE,
    "DOUBLE": TokenType.DOUBLE,
    "DOUBLE PRECISION": TokenType.DOUBLE,
    "JSON": TokenType.JSON,
    "JSONB": TokenType.JSONB,
    "CHAR": TokenType.CHAR,
    "CHARACTER": TokenType.CHAR,
    "CHAR VARYING": TokenType.VARCHAR,
    "CHARACTER VARYING": TokenType.VARCHAR,
    "NCHAR": TokenType.NCHAR,
    "VARCHAR": TokenType.VARCHAR,
    "VARCHAR2": TokenType.VARCHAR,
    "NVARCHAR": TokenType.NVARCHAR,
    "NVARCHAR2": TokenType.NVARCHAR,
    "BPCHAR": TokenType.BPCHAR,
    "STR": TokenType.TEXT,
    "STRING": TokenType.TEXT,
    "TEXT": TokenType.TEXT,
    "LONGTEXT": TokenType.LONGTEXT,
    "MEDIUMTEXT": TokenType.MEDIUMTEXT,
    "TINYTEXT": TokenType.TINYTEXT,
    "CLOB": TokenType.TEXT,
    "LONGVARCHAR": TokenType.TEXT,
    "BINARY": TokenType.BINARY,
    "BLOB": TokenType.VARBINARY,
    "LONGBLOB": TokenType.LONGBLOB,
    "MEDIUMBLOB": TokenType.MEDIUMBLOB,
    "TINYBLOB": TokenType.TINYBLOB,
    "BYTEA": TokenType.VARBINARY,
    "VARBINARY": TokenType.VARBINARY,
    "TIME": TokenType.TIME,
    "TIMETZ": TokenType.TIMETZ,
    "TIME_NS": TokenType.TIME_NS,
    "TIMESTAMP": TokenType.TIMESTAMP,
    "TIMESTAMPTZ": TokenType.TIMESTAMPTZ,
    "TIMESTAMPLTZ": TokenType.TIMESTAMPLTZ,
    "TIMESTAMP_LTZ": TokenType.TIMESTAMPLTZ,
    "TIMESTAMPNTZ": TokenType.TIMESTAMPNTZ,
    "TIMESTAMP_NTZ": TokenType.TIMESTAMPNTZ,
    "DATE": TokenType.DATE,
    "DATETIME": TokenType.DATETIME,
    "INT4RANGE": TokenType.INT4RANGE,
    "INT4MULTIRANGE": TokenType.INT4MULTIRANGE,
    "INT8RANGE": TokenType.INT8RANGE,
    "INT8MULTIRANGE": TokenType.INT8MULTIRANGE,
    "NUMRANGE": TokenType.NUMRANGE,
    "NUMMULTIRANGE": TokenType.NUMMULTIRANGE,
    "TSRANGE": TokenType.TSRANGE,
    "TSMULTIRANGE": TokenType.TSMULTIRANGE,
    "TSTZRANGE": TokenType.TSTZRANGE,
    "TSTZMULTIRANGE": TokenType.TSTZMULTIRANGE,
    "DATERANGE": TokenType.DATERANGE,
    "DATEMULTIRANGE": TokenType.DATEMULTIRANGE,
    "UNIQUE": TokenType.UNIQUE,
    "VECTOR": TokenType.VECTOR,
    "STRUCT": TokenType.STRUCT,
    "SEQUENCE": TokenType.SEQUENCE,
    "VARIANT": TokenType.VARIANT,
    "ALTER": TokenType.ALTER,
    "ANALYZE": TokenType.ANALYZE,
    "CALL": TokenType.COMMAND,
    "COMMENT": TokenType.COMMENT,
    "EXPLAIN": TokenType.COMMAND,
    "GRANT": TokenType.GRANT,
    "REVOKE": TokenType.REVOKE,
    "OPTIMIZE": TokenType.COMMAND,
    "PREPARE": TokenType.COMMAND,
    "VACUUM": TokenType.COMMAND,
    "USER-DEFINED": TokenType.USERDEFINED,
    "FOR VERSION": TokenType.VERSION_SNAPSHOT,
    "FOR TIMESTAMP": TokenType.TIMESTAMP_SNAPSHOT,
  };

  static WHITE_SPACE: Record<string, TokenType> = {
    " ": TokenType.SPACE,
    "\t": TokenType.SPACE,
    "\n": TokenType.BREAK,
    "\r": TokenType.BREAK,
  };

  static COMMANDS: Set<TokenType> = new Set([
    TokenType.COMMAND,
    TokenType.EXECUTE,
    TokenType.FETCH,
    TokenType.SHOW,
    TokenType.RENAME,
  ]);

  static COMMAND_PREFIX_TOKENS: Set<TokenType> = new Set([
    TokenType.SEMICOLON,
    TokenType.BEGIN,
  ]);

  static NUMERIC_LITERALS: Record<string, string> = {};

  static COMMENTS: Array<string | [string, string]> = ["--", ["/*", "*/"]];

  static ESCAPE_SEQUENCES: Record<string, string> = {};

  // -------------------------------------------------------------------
  // Computed (cached) config -- populated by _initializeConfig()
  // -------------------------------------------------------------------
  private _quotes: Record<string, string> = {};
  private _identifiers: Record<string, string> = {};
  private _formatStrings: Record<string, [string, TokenType]> = {};
  private _stringEscapes: Set<string> = new Set();
  private _byteStringEscapes: Set<string> = new Set();
  private _escapeFollowChars: Set<string> = new Set();
  private _identifierEscapes: Set<string> = new Set();
  private _comments: Record<string, string | null> = {};
  private _keywordTrie: Trie = new Map();

  // -------------------------------------------------------------------
  // Instance state
  // -------------------------------------------------------------------
  sql = "";
  size = 0;
  tokens: Token[] = [];
  dialectSettings: DialectSettings;

  private _start = 0;
  private _current = 0;
  private _line = 1;
  private _col = 0;
  private _tokenComments: string[] = [];
  private _char = "";
  private _end = false;
  private _peek = "";
  private _prevTokenLine = -1;

  constructor(dialectSettings?: DialectSettings) {
    this.dialectSettings = dialectSettings ?? DEFAULT_DIALECT_SETTINGS;
    this._initializeConfig();
    this.reset();
  }

  // Access static properties via the constructor so that subclass overrides work
  private get ctor(): typeof Tokenizer {
    return this.constructor as typeof Tokenizer;
  }

  private _initializeConfig(): void {
    const ctor = this.ctor;

    this._quotes = convertQuotes(ctor.QUOTES);
    this._identifiers = convertQuotes(ctor.IDENTIFIERS);

    // Build _FORMAT_STRINGS: national strings + typed format strings
    this._formatStrings = {};
    for (const [s, e] of Object.entries(this._quotes)) {
      for (const p of ["n", "N"]) {
        this._formatStrings[p + s] = [e, TokenType.NATIONAL_STRING];
      }
    }
    Object.assign(
      this._formatStrings,
      quotesToFormat(TokenType.BIT_STRING, ctor.BIT_STRINGS),
      quotesToFormat(TokenType.BYTE_STRING, ctor.BYTE_STRINGS),
      quotesToFormat(TokenType.HEX_STRING, ctor.HEX_STRINGS),
      quotesToFormat(TokenType.RAW_STRING, ctor.RAW_STRINGS),
      quotesToFormat(TokenType.HEREDOC_STRING, ctor.HEREDOC_STRINGS),
      quotesToFormat(TokenType.UNICODE_STRING, ctor.UNICODE_STRINGS),
    );

    // Byte string escapes default to string escapes if not explicitly set
    const byteStringEscapes =
      ctor.BYTE_STRING_ESCAPES.length > 0
        ? ctor.BYTE_STRING_ESCAPES
        : [...ctor.STRING_ESCAPES];

    this._stringEscapes = new Set(ctor.STRING_ESCAPES);
    this._byteStringEscapes = new Set(byteStringEscapes);
    this._escapeFollowChars = new Set(ctor.ESCAPE_FOLLOW_CHARS);
    this._identifierEscapes = new Set(ctor.IDENTIFIER_ESCAPES);

    // Build _COMMENTS
    this._comments = {};
    for (const comment of ctor.COMMENTS) {
      if (typeof comment === "string") {
        this._comments[comment] = null;
      } else {
        this._comments[comment[0]] = comment[1];
      }
    }
    // Ensure Jinja comments are tokenized correctly in all dialects
    this._comments["{#"] = "#}";
    if (ctor.HINT_START in ctor.KEYWORDS) {
      this._comments[ctor.HINT_START] = "*/";
    }

    // Build keyword trie
    const trieKeys: string[] = [];
    const allKeys = [
      ...Object.keys(ctor.KEYWORDS),
      ...Object.keys(this._comments),
      ...Object.keys(this._quotes),
      ...Object.keys(this._formatStrings),
    ];
    for (const key of allKeys) {
      const upper = key.toUpperCase();
      if (
        upper.includes(" ") ||
        [...upper].some((ch) => ch in ctor.SINGLE_TOKENS)
      ) {
        trieKeys.push(upper);
      }
    }
    this._keywordTrie = newTrie(trieKeys);
  }

  reset(): void {
    this.sql = "";
    this.size = 0;
    this.tokens = [];
    this._start = 0;
    this._current = 0;
    this._line = 1;
    this._col = 0;
    this._tokenComments = [];
    this._char = "";
    this._end = false;
    this._peek = "";
    this._prevTokenLine = -1;
  }

  tokenize(sql: string): Token[] {
    this.reset();
    this.sql = sql;
    this.size = sql.length;

    try {
      this.scan();
    } catch (e) {
      const start = Math.max(this._current - 50, 0);
      const end = Math.min(this._current + 50, this.size - 1);
      const context = this.sql.slice(start, end);
      if (e instanceof TokenError) {
        throw e;
      }
      throw new TokenError(
        `Error tokenizing '${context}'${e instanceof Error ? `: ${e.message}` : ""}`,
      );
    }

    return this.tokens;
  }

  private scan(until?: () => boolean): void {
    while (this.size && !this._end) {
      let current = this._current;

      // Skip spaces here rather than iteratively calling advance() for performance
      while (current < this.size) {
        const char = this.sql[current]!;
        if ((char === " " || char === "\t") && isSpace(char)) {
          current += 1;
        } else {
          break;
        }
      }

      const offset = current > this._current ? current - this._current : 1;

      this._start = current;
      this.advance(offset);

      if (!isSpace(this._char)) {
        if (isDigit(this._char)) {
          this.scanNumber();
        } else if (this._char in this._identifiers) {
          this.scanIdentifier(this._identifiers[this._char]!);
        } else {
          this.scanKeywords();
        }
      }

      if (until && until()) {
        break;
      }
    }

    if (this.tokens.length > 0 && this._tokenComments.length > 0) {
      this.tokens[this.tokens.length - 1]!.comments.push(
        ...this._tokenComments,
      );
    }
  }

  private chars(size: number): string {
    if (size === 1) {
      return this._char;
    }
    const start = this._current - 1;
    const end = start + size;
    return end <= this.size ? this.sql.slice(start, end) : "";
  }

  private advance(i: number = 1, alnum: boolean = false): void {
    if (
      this.ctor.WHITE_SPACE[this._char] === TokenType.BREAK
    ) {
      // Ensures we don't count an extra line if we get a \r\n line break sequence
      if (!(this._char === "\r" && this._peek === "\n")) {
        this._col = i;
        this._line += 1;
      }
    } else {
      this._col += i;
    }

    this._current += i;
    this._end = this._current >= this.size;
    this._char = this.sql[this._current - 1] ?? "";
    this._peek = this._end ? "" : (this.sql[this._current] ?? "");

    if (alnum && isAlnum(this._char)) {
      let col = this._col;
      let current = this._current;
      let end = this._end;
      let peek = this._peek;

      while (isAlnum(peek)) {
        col += 1;
        current += 1;
        end = current >= this.size;
        peek = end ? "" : (this.sql[current] ?? "");
      }

      this._col = col;
      this._current = current;
      this._end = end;
      this._peek = peek;
      this._char = this.sql[current - 1] ?? "";
    }
  }

  private get text(): string {
    return this.sql.slice(this._start, this._current);
  }

  private add(tokenType: TokenType, text?: string): void {
    this._prevTokenLine = this._line;

    if (
      this._tokenComments.length > 0 &&
      tokenType === TokenType.SEMICOLON &&
      this.tokens.length > 0
    ) {
      this.tokens[this.tokens.length - 1]!.comments.push(
        ...this._tokenComments,
      );
      this._tokenComments = [];
    }

    this.tokens.push(
      new Token(
        tokenType,
        text ?? this.text,
        this._line,
        this._col,
        this._start,
        this._current - 1,
        this._tokenComments,
      ),
    );
    this._tokenComments = [];

    // If we have either a semicolon or a begin token before the command's token,
    // we'll parse whatever follows the command's token as a string
    if (
      this.ctor.COMMANDS.has(tokenType) &&
      this._peek !== ";" &&
      (this.tokens.length === 1 ||
        this.ctor.COMMAND_PREFIX_TOKENS.has(
          this.tokens[this.tokens.length - 2]!.tokenType,
        ))
    ) {
      const start = this._current;
      const tokenCount = this.tokens.length;
      this.scan(() => this._peek === ";");
      this.tokens = this.tokens.slice(0, tokenCount);
      const cmdText = this.sql.slice(start, this._current).trim();
      if (cmdText) {
        this.add(TokenType.STRING, cmdText);
      }
    }
  }

  private scanKeywords(): void {
    let size = 0;
    let word: string | null = null;
    let chars = this.text;
    let char = chars;
    let prevSpace = false;
    let skip = false;
    let trie = this._keywordTrie;
    let singleToken = char in this.ctor.SINGLE_TOKENS;

    while (chars) {
      let result: TrieResult;

      if (skip) {
        result = TrieResult.PREFIX;
      } else {
        [result, trie] = inTrie(trie, char.toUpperCase());
      }

      if (result === TrieResult.FAILED) {
        break;
      }
      if (result === TrieResult.EXISTS) {
        word = chars;
      }

      const end = this._current + size;
      size += 1;

      if (end < this.size) {
        char = this.sql[end]!;
        singleToken = singleToken || char in this.ctor.SINGLE_TOKENS;
        const charIsSpace = isSpace(char);

        if (!charIsSpace || !prevSpace) {
          if (charIsSpace) {
            char = " ";
          }
          chars += char;
          prevSpace = charIsSpace;
          skip = false;
        } else {
          skip = true;
        }
      } else {
        char = "";
        break;
      }
    }

    if (word) {
      if (this.scanString(word)) {
        return;
      }
      if (this.scanComment(word)) {
        return;
      }
      if (prevSpace || singleToken || !char) {
        this.advance(size - 1);
        word = word.toUpperCase();
        this.add(this.ctor.KEYWORDS[word]!, word);
        return;
      }
    }

    if (this._char in this.ctor.SINGLE_TOKENS) {
      this.add(this.ctor.SINGLE_TOKENS[this._char]!, this._char);
      return;
    }

    this.scanVar();
  }

  private scanComment(commentStart: string): boolean {
    if (!(commentStart in this._comments)) {
      return false;
    }

    const commentStartLine = this._line;
    const commentStartSize = commentStart.length;
    const commentEnd = this._comments[commentStart];

    if (commentEnd) {
      // Skip the comment's start delimiter
      this.advance(commentStartSize);

      let commentCount = 1;
      const commentEndSize = commentEnd.length;

      while (!this._end) {
        if (this.chars(commentEndSize) === commentEnd) {
          commentCount -= 1;
          if (!commentCount) {
            break;
          }
        }

        this.advance(1, true);

        // Nested comments are allowed by some dialects
        if (
          this.ctor.NESTED_COMMENTS &&
          !this._end &&
          this.chars(commentStartSize) === commentStart
        ) {
          this.advance(commentStartSize);
          commentCount += 1;
        }
      }

      this._tokenComments.push(
        this.text.slice(commentStartSize, -commentEndSize + 1),
      );
      this.advance(commentEndSize - 1);
    } else {
      while (
        !this._end &&
        this.ctor.WHITE_SPACE[this._peek] !== TokenType.BREAK
      ) {
        this.advance(1, true);
      }
      this._tokenComments.push(this.text.slice(commentStartSize));
    }

    if (
      commentStart === this.ctor.HINT_START &&
      this.tokens.length > 0 &&
      this.ctor.TOKENS_PRECEDING_HINT.has(
        this.tokens[this.tokens.length - 1]!.tokenType,
      )
    ) {
      this.add(TokenType.HINT);
    }

    // Leading comment is attached to the succeeding token, whilst trailing comment to the preceding.
    if (commentStartLine === this._prevTokenLine) {
      this.tokens[this.tokens.length - 1]!.comments.push(
        ...this._tokenComments,
      );
      this._tokenComments = [];
      this._prevTokenLine = this._line;
    }

    return true;
  }

  private scanNumber(): void {
    if (this._char === "0") {
      const peek = this._peek.toUpperCase();
      if (peek === "B") {
        if (this.ctor.BIT_STRINGS.length > 0) {
          return this.scanBits();
        } else {
          return this.add(TokenType.NUMBER);
        }
      } else if (peek === "X") {
        if (this.ctor.HEX_STRINGS.length > 0) {
          return this.scanHex();
        } else {
          return this.add(TokenType.NUMBER);
        }
      }
    }

    let decimal = false;
    let scientific = 0;

    while (true) {
      if (isDigit(this._peek)) {
        this.advance();
      } else if (this._peek === "." && !decimal) {
        if (
          this.tokens.length > 0 &&
          this.tokens[this.tokens.length - 1]!.tokenType === TokenType.PARAMETER
        ) {
          return this.add(TokenType.NUMBER);
        }
        decimal = true;
        this.advance();
      } else if ((this._peek === "-" || this._peek === "+") && scientific === 1) {
        // Only consume +/- if followed by a digit
        if (
          this._current + 1 < this.size &&
          isDigit(this.sql[this._current + 1] ?? "")
        ) {
          scientific += 1;
          this.advance();
        } else {
          return this.add(TokenType.NUMBER);
        }
      } else if (this._peek.toUpperCase() === "E" && !scientific) {
        scientific += 1;
        this.advance();
      } else if (
        this._peek === "_" &&
        this.dialectSettings.NUMBERS_CAN_BE_UNDERSCORE_SEPARATED
      ) {
        this.advance();
      } else if (isIdentifierChar(this._peek) && this._peek.trim() !== "") {
        const numberText = this.text;
        let literal = "";

        while (
          this._peek.trim() !== "" &&
          !(this._peek in this.ctor.SINGLE_TOKENS)
        ) {
          literal += this._peek;
          this.advance();
        }

        const numericLiteralKey = this.ctor.NUMERIC_LITERALS[literal.toUpperCase()];
        const tokenType = numericLiteralKey
          ? this.ctor.KEYWORDS[numericLiteralKey]
          : undefined;

        if (tokenType) {
          this.add(TokenType.NUMBER, numberText);
          this.add(TokenType.DCOLON, "::");
          return this.add(tokenType, literal);
        } else if (this.dialectSettings.IDENTIFIERS_CAN_START_WITH_DIGIT) {
          return this.add(TokenType.VAR);
        }

        this.advance(-literal.length);
        return this.add(TokenType.NUMBER, numberText);
      } else {
        return this.add(TokenType.NUMBER);
      }
    }
  }

  private scanBits(): void {
    this.advance();
    const value = this.extractValue();
    try {
      // Validate binary string
      const numStr = value.slice(2); // Drop the 0b
      if (!/^[01]+$/.test(numStr) || numStr.length === 0) {
        throw new Error("invalid");
      }
      this.add(TokenType.BIT_STRING, numStr);
    } catch {
      this.add(TokenType.IDENTIFIER);
    }
  }

  private scanHex(): void {
    this.advance();
    const value = this.extractValue();
    try {
      // Validate hex string
      const numStr = value.slice(2); // Drop the 0x
      if (!/^[0-9a-fA-F]+$/.test(numStr) || numStr.length === 0) {
        throw new Error("invalid");
      }
      this.add(TokenType.HEX_STRING, numStr);
    } catch {
      this.add(TokenType.IDENTIFIER);
    }
  }

  private extractValue(): string {
    while (true) {
      const char = this._peek.trim();
      if (char && !(char in this.ctor.SINGLE_TOKENS)) {
        this.advance(1, true);
      } else {
        break;
      }
    }
    return this.text;
  }

  private scanString(start: string): boolean {
    let base: number | null = null;
    let tokenType = TokenType.STRING;

    let end: string;

    if (start in this._quotes) {
      end = this._quotes[start]!;
    } else if (start in this._formatStrings) {
      const fmt = this._formatStrings[start]!;
      end = fmt[0];
      tokenType = fmt[1];

      if (tokenType === TokenType.HEX_STRING) {
        base = 16;
      } else if (tokenType === TokenType.BIT_STRING) {
        base = 2;
      } else if (tokenType === TokenType.HEREDOC_STRING) {
        this.advance();

        let tag: string;
        if (this._char === end) {
          tag = "";
        } else {
          tag = this.extractString(
            end,
            undefined,
            true,
            !this.ctor.HEREDOC_TAG_IS_IDENTIFIER,
          );
        }

        if (
          tag &&
          this.ctor.HEREDOC_TAG_IS_IDENTIFIER &&
          (this._end || /^\d+$/.test(tag) || [...tag].some((c) => isSpace(c)))
        ) {
          if (!this._end) {
            this.advance(-1);
          }
          this.advance(-tag.length);
          this.add(this.ctor.HEREDOC_STRING_ALTERNATIVE);
          return true;
        }

        end = `${start}${tag}${end}`;
      }
    } else {
      return false;
    }

    this.advance(start.length);
    const text = this.extractString(
      end,
      tokenType === TokenType.BYTE_STRING
        ? this._byteStringEscapes
        : this._stringEscapes,
      tokenType === TokenType.RAW_STRING,
    );

    if (base && text) {
      try {
        if (base === 16) {
          if (!/^[0-9a-fA-F]*$/.test(text)) {
            throw new Error("invalid hex");
          }
        } else if (base === 2) {
          if (!/^[01]*$/.test(text)) {
            throw new Error("invalid binary");
          }
        }
      } catch {
        throw new TokenError(
          `Numeric string contains invalid characters from ${this._line}:${this._start}`,
        );
      }
    }

    this.add(tokenType, text);
    return true;
  }

  private scanIdentifier(identifierEnd: string): void {
    this.advance();
    const escapes = new Set([...this._identifierEscapes, identifierEnd]);
    const text = this.extractString(identifierEnd, escapes);
    this.add(TokenType.IDENTIFIER, text);
  }

  private scanVar(): void {
    while (true) {
      const char = this._peek.trim();
      if (
        char &&
        (this.ctor.VAR_SINGLE_TOKENS.has(char) ||
          !(char in this.ctor.SINGLE_TOKENS))
      ) {
        this.advance(1, true);
      } else {
        break;
      }
    }

    this.add(
      this.tokens.length > 0 &&
        this.tokens[this.tokens.length - 1]!.tokenType === TokenType.PARAMETER
        ? TokenType.VAR
        : (this.ctor.KEYWORDS[this.text.toUpperCase()] ?? TokenType.VAR),
    );
  }

  private extractString(
    delimiter: string,
    escapes?: Set<string>,
    rawString: boolean = false,
    raiseUnmatched: boolean = true,
  ): string {
    let text = "";
    const delimSize = delimiter.length;
    const esc = escapes ?? this._stringEscapes;

    while (true) {
      if (
        !rawString &&
        Object.keys(this.dialectSettings.UNESCAPED_SEQUENCES).length > 0 &&
        this._peek &&
        esc.has(this._char)
      ) {
        const unescapedSequence =
          this.dialectSettings.UNESCAPED_SEQUENCES[this._char + this._peek];
        if (unescapedSequence) {
          this.advance(2);
          text += unescapedSequence;
          continue;
        }
      }

      const isValidCustomEscape =
        this.ctor.ESCAPE_FOLLOW_CHARS.length > 0 &&
        this._char === "\\" &&
        !this._escapeFollowChars.has(this._peek);

      if (
        (this.ctor.STRING_ESCAPES_ALLOWED_IN_RAW_STRINGS || !rawString) &&
        esc.has(this._char) &&
        (this._peek === delimiter ||
          esc.has(this._peek) ||
          isValidCustomEscape) &&
        (!this._quotes[this._char] || this._char === this._peek)
      ) {
        if (this._peek === delimiter) {
          text += this._peek;
        } else if (isValidCustomEscape && this._char !== this._peek) {
          text += this._peek;
        } else {
          text += this._char + this._peek;
        }

        if (this._current + 1 < this.size) {
          this.advance(2);
        } else {
          throw new TokenError(
            `Missing ${delimiter} from ${this._line}:${this._current}`,
          );
        }
      } else {
        if (this.chars(delimSize) === delimiter) {
          if (delimSize > 1) {
            this.advance(delimSize - 1);
          }
          break;
        }

        if (this._end) {
          if (!raiseUnmatched) {
            return text + this._char;
          }
          throw new TokenError(
            `Missing ${delimiter} from ${this._line}:${this._start}`,
          );
        }

        const current = this._current - 1;
        this.advance(1, true);
        text += this.sql.slice(current, this._current - 1);
      }
    }

    return text;
  }
}
