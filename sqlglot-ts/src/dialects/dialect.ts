import type { Token } from "../tokens.js";
import type { Expression } from "../expressions.js";
import { Parser, _setExpModule as _setParserExpModule } from "../parser.js";
import { Generator, _setExpModule as _setGeneratorExpModule } from "../generator.js";
import type { ErrorLevel } from "../errors.js";

// Lazy-loaded modules (set by index.ts to break circular dependency)
let exp: any;
let Tokenizer: any;

export function _setExpModule(m: any): void {
  exp = m;
  _setParserExpModule(m);
  _setGeneratorExpModule(m);
}

export function _setTokenizerModule(m: any): void {
  Tokenizer = m;
}

// ---------------------------------------------------------------------------
// Dialect registry
// ---------------------------------------------------------------------------
const _dialects: Record<string, typeof Dialect> = {};

// ---------------------------------------------------------------------------
// Dialect
// ---------------------------------------------------------------------------

/**
 * Base dialect class.
 *
 * The default ("sqlglot") dialect is a superset that accommodates common SQL
 * syntax. Specific dialects can subclass Dialect and override the
 * TokenizerClass, ParserClass, and GeneratorClass static members.
 */
export class Dialect {
  // ── dialect-level settings ────────────────────────────────────────────
  static QUOTE_START = "'";
  static QUOTE_END = "'";
  static IDENTIFIER_START = '"';
  static IDENTIFIER_END = '"';
  static NORMALIZE_FUNCTIONS: string | boolean = "upper";

  // ── component classes (override in subclass dialects) ─────────────────
  static TokenizerClass: any = null; // Will be set to the actual Tokenizer class
  static ParserClass: typeof Parser = Parser;
  static GeneratorClass: typeof Generator = Generator;

  // ── instance aliases ──────────────────────────────────────────────────
  get QUOTE_START(): string {
    return (this.constructor as typeof Dialect).QUOTE_START;
  }
  get QUOTE_END(): string {
    return (this.constructor as typeof Dialect).QUOTE_END;
  }
  get IDENTIFIER_START(): string {
    return (this.constructor as typeof Dialect).IDENTIFIER_START;
  }
  get IDENTIFIER_END(): string {
    return (this.constructor as typeof Dialect).IDENTIFIER_END;
  }
  get NORMALIZE_FUNCTIONS(): string | boolean {
    return (this.constructor as typeof Dialect).NORMALIZE_FUNCTIONS;
  }

  // ── static registry methods ───────────────────────────────────────────

  /**
   * Look up a dialect by name/class/instance. Returns a Dialect instance.
   */
  static getOrRaise(dialect?: string | Dialect | typeof Dialect | null): Dialect {
    if (!dialect) return new Dialect();
    if (dialect instanceof Dialect) return dialect;
    if (typeof dialect === "function" && dialect.prototype instanceof Dialect) {
      return new (dialect as typeof Dialect)();
    }
    if (typeof dialect === "string") {
      const key = dialect.toLowerCase().trim();
      if (key === "" || key === "sqlglot") return new Dialect();
      const DialectClass = _dialects[key];
      if (DialectClass) return new DialectClass();
      throw new Error(`Unknown dialect: '${dialect}'`);
    }
    return new Dialect();
  }

  /**
   * Register a dialect class under one or more names.
   */
  static register(names: string | string[], dialectClass: typeof Dialect): void {
    const nameList = Array.isArray(names) ? names : [names];
    for (const name of nameList) {
      _dialects[name.toLowerCase()] = dialectClass;
    }
  }

  // ── instance API ──────────────────────────────────────────────────────

  tokenize(sql: string): Token[] {
    const TokClass =
      (this.constructor as typeof Dialect).TokenizerClass ?? Tokenizer?.Tokenizer;
    if (!TokClass) {
      throw new Error(
        "Tokenizer not available. Make sure index.ts has initialized modules.",
      );
    }
    const tokenizer = new TokClass();
    return tokenizer.tokenize(sql);
  }

  parse(sql: string, opts: Record<string, any> = {}): Array<Expression | null> {
    const ParserCls = (this.constructor as typeof Dialect).ParserClass;
    const parser = new ParserCls(this, opts.error_level);
    return parser.parse(this.tokenize(sql), sql);
  }

  parseInto(
    _into: any,
    sql: string,
    opts: Record<string, any> = {},
  ): Expression {
    // Simplified: parse_into that returns the first expression
    const results = this.parse(sql, opts);
    return results[0]!;
  }

  generate(
    expression: Expression,
    opts: Record<string, any> = {},
  ): string {
    const GenCls = (this.constructor as typeof Dialect).GeneratorClass;
    const generator = new GenCls({ dialect: this, ...opts });
    return generator.generate(expression, opts.copy !== false);
  }

  transpile(sql: string, opts: Record<string, any> = {}): string[] {
    return this.parse(sql).map((expression) =>
      expression ? this.generate(expression, { ...opts, copy: false }) : "",
    );
  }
}

// Register the base dialect
Dialect.register(["", "sqlglot"], Dialect);
