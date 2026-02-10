/**
 * SQLGlot TypeScript - SQL Parser, Transpiler, and Generator
 *
 * Main entry point. Wires up circular dependencies between modules
 * and exports the public API.
 */

// --- Module imports ---
import * as expressions from "./expressions.js";
import * as tokenizer from "./tokenizer.js";
import { Dialect, _setExpModule, _setTokenizerModule } from "./dialects/index.js";
import { _setDialectModule } from "./expressions.js";

// --- Wire up circular dependencies ---
_setExpModule(expressions);
_setTokenizerModule(tokenizer);
_setDialectModule({ Dialect });

// --- Re-exports ---
export { TokenType, Token } from "./tokens.js";
export {
  ErrorLevel,
  SqlglotError,
  ParseError,
  TokenError,
  UnsupportedError,
} from "./errors.js";
export { Dialect } from "./dialects/index.js";
export { Parser } from "./parser.js";
export { Generator } from "./generator.js";
export * from "./expressions.js";

// --- Top-level convenience functions ---

import type { Expression } from "./expressions.js";

/**
 * Parse a SQL string into a list of AST expressions.
 *
 * @param sql The SQL string to parse.
 * @param opts Options including `dialect` (string).
 * @returns An array of parsed expressions (some may be null for empty statements).
 */
export function parse(
  sql: string,
  opts?: { dialect?: string; [key: string]: any },
): Array<Expression | null> {
  const dialect = Dialect.getOrRaise(opts?.dialect);
  return dialect.parse(sql, opts);
}

/**
 * Parse a SQL string and return exactly one expression.
 *
 * @param sql The SQL string to parse (must contain exactly one statement).
 * @param opts Options including `dialect` (string).
 * @returns The parsed expression.
 * @throws If the SQL contains zero or more than one statement.
 */
export function parseOne(
  sql: string,
  opts?: { dialect?: string; [key: string]: any },
): Expression {
  const results = parse(sql, opts);
  if (results.length === 0 || results[0] === null) {
    throw new Error(`No expression was parsed from: ${sql}`);
  }
  if (results.length > 1 && results.some((r, i) => i > 0 && r !== null)) {
    throw new Error(
      `Multiple expressions were parsed from: ${sql}. Use parse() instead.`,
    );
  }
  return results[0]!;
}

/**
 * Transpile SQL from one dialect to another.
 *
 * @param sql The source SQL string.
 * @param opts Options including `readDialect` and `writeDialect`.
 * @returns An array of transpiled SQL strings (one per statement).
 */
export function transpile(
  sql: string,
  opts?: {
    readDialect?: string;
    writeDialect?: string;
    pretty?: boolean;
    [key: string]: any;
  },
): string[] {
  const readDialect = Dialect.getOrRaise(opts?.readDialect);
  const writeDialect = Dialect.getOrRaise(opts?.writeDialect);

  const expressions = readDialect.parse(sql);
  return expressions.map((expression) => {
    if (!expression) return "";
    return writeDialect.generate(expression, {
      pretty: opts?.pretty,
      copy: false,
    });
  });
}
