/**
 * PRQL dialect for sqlglot-ts.
 *
 * PRQL (Pipelined Relational Query Language) is an alternative query language
 * that compiles to SQL. In sqlglot's context, the PRQL dialect customizes
 * tokenization so that PRQL-specific syntax (backtick identifiers, `=` as alias,
 * `#` as comment prefix, `&&` as AND, `||` as OR) is handled correctly.
 *
 * The Python PRQL dialect has an extensive custom parser that translates PRQL's
 * pipeline syntax (from, derive, select, take, filter, sort, aggregate, etc.)
 * into SQL AST nodes. This TS port provides the tokenizer customizations and
 * dialect registration. The full PRQL parser is not yet ported.
 *
 * The generator outputs standard SQL since PRQL compiles to SQL.
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// PRQL Tokenizer
// ---------------------------------------------------------------------------

class PRQLTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ["`"];
  static override QUOTES: Array<string | [string, string]> = ["'", '"'];

  static override SINGLE_TOKENS: Record<string, TokenType> = {
    ...Tokenizer.SINGLE_TOKENS,
    "=": TokenType.ALIAS,
    "'": TokenType.UNKNOWN,
    '"': TokenType.UNKNOWN,
    "`": TokenType.UNKNOWN,
    "#": TokenType.COMMENT,
  };

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
  };

  static override COMMENTS: Array<string | [string, string]> = [
    "#",
    ["/*", "*/"],
  ];
}

// ---------------------------------------------------------------------------
// PRQL Generator
// ---------------------------------------------------------------------------

class PRQLGenerator extends Generator {
  // PRQL compiles to standard SQL, so no special type mappings are needed.
  // The default generator handles SQL output.
}

// ---------------------------------------------------------------------------
// PRQL Dialect
// ---------------------------------------------------------------------------

export class PRQL extends Dialect {
  static override IDENTIFIER_START = "`";
  static override IDENTIFIER_END = "`";
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";

  static override TokenizerClass: any = PRQLTokenizer;
  static override GeneratorClass: typeof Generator = PRQLGenerator;
}

// Register the dialect
Dialect.register(["prql"], PRQL);
