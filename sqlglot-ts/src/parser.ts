import { TokenType, Token } from "./tokens.js";
import type { Expression } from "./expressions.js";
import {
  ParseError,
  ErrorLevel,
  highlightSql,
  concatMessages,
  mergeErrors,
} from "./errors.js";
import { seqGet } from "./helper.js";

// Lazy-loaded expressions module (set by index.ts to break circular dependency)
let exp: any;
export function _setExpModule(m: any): void {
  exp = m;
}

/**
 * Minimal recursive-descent parser for SQL.
 *
 * Supports: SELECT with expressions, FROM, WHERE, JOIN, GROUP BY, HAVING,
 * ORDER BY, LIMIT, OFFSET, basic function calls, aliases, subqueries,
 * UNION/INTERSECT/EXCEPT, WITH (CTEs), CASE/WHEN, CAST, IN, BETWEEN,
 * IS, LIKE, EXISTS, NOT, and parenthesized expressions.
 */
export class Parser {
  // ── dialect-overridable maps ──────────────────────────────────────────

  static CONJUNCTION: Record<string, any> = { [TokenType.AND]: "And" };
  static DISJUNCTION: Record<string, any> = { [TokenType.OR]: "Or" };
  static EQUALITY: Record<string, any> = {
    [TokenType.EQ]: "EQ",
    [TokenType.NEQ]: "NEQ",
  };
  static COMPARISON: Record<string, any> = {
    [TokenType.GT]: "GT",
    [TokenType.GTE]: "GTE",
    [TokenType.LT]: "LT",
    [TokenType.LTE]: "LTE",
  };
  static TERM: Record<string, any> = {
    [TokenType.DASH]: "Sub",
    [TokenType.PLUS]: "Add",
    [TokenType.MOD]: "Mod",
  };
  static FACTOR: Record<string, any> = {
    [TokenType.SLASH]: "Div",
    [TokenType.STAR]: "Mul",
  };

  // ── parser state ──────────────────────────────────────────────────────

  private sql: string = "";
  errors: ParseError[] = [];
  private _tokens: Token[] = [];
  private _index: number = 0;
  private _curr: Token | null = null;
  private _next: Token | null = null;
  private _prev: Token | null = null;
  private _prevComments: string[] | null = null;
  dialect: any;
  errorLevel: ErrorLevel;
  errorMessageContext: number = 100;
  maxErrors: number = 3;

  constructor(dialect?: any, errorLevel?: ErrorLevel) {
    this.dialect = dialect;
    this.errorLevel = errorLevel ?? ErrorLevel.IMMEDIATE;
  }

  // ── public API ────────────────────────────────────────────────────────

  parse(rawTokens: Token[], sql?: string): Array<Expression | null> {
    this._reset();
    this.sql = sql ?? "";

    // Split into chunks on semicolons (mirroring Python's _parse)
    const total = rawTokens.length;
    const chunks: Token[][] = [[]];
    for (let i = 0; i < total; i++) {
      const token = rawTokens[i]!;
      if (token.tokenType === TokenType.SEMICOLON) {
        if (i < total - 1) {
          chunks.push([]);
        }
      } else {
        chunks[chunks.length - 1]!.push(token);
      }
    }

    const expressions: Array<Expression | null> = [];
    for (const chunk of chunks) {
      this._tokens = chunk;
      this._index = -1;
      this._advance();

      const stmt = this._parseStatement();
      expressions.push(stmt);

      if (this._index < this._tokens.length) {
        this.raiseError("Invalid expression / Unexpected token");
      }
      this._checkErrors();
    }
    return expressions;
  }

  // ── reset ─────────────────────────────────────────────────────────────

  private _reset(): void {
    this.sql = "";
    this.errors = [];
    this._tokens = [];
    this._index = 0;
    this._curr = null;
    this._next = null;
    this._prev = null;
    this._prevComments = null;
  }

  // ── cursor helpers ────────────────────────────────────────────────────

  private _advance(times: number = 1): void {
    this._index += times;
    this._curr = seqGet(this._tokens, this._index);
    this._next = seqGet(this._tokens, this._index + 1);

    if (this._index > 0) {
      this._prev = this._tokens[this._index - 1] ?? null;
      this._prevComments = this._prev?.comments ?? null;
    } else {
      this._prev = null;
      this._prevComments = null;
    }
  }

  private _retreat(index: number): void {
    if (index !== this._index) {
      this._advance(index - this._index);
    }
  }

  private get _done(): boolean {
    return this._curr === null;
  }

  // ── token matching ────────────────────────────────────────────────────

  private _match(tokenType: TokenType, advance: boolean = true): boolean {
    if (!this._curr) return false;
    if (this._curr.tokenType === tokenType) {
      if (advance) this._advance();
      return true;
    }
    return false;
  }

  private _matchSet(
    types: Set<TokenType> | Record<string, any>,
    advance: boolean = true,
  ): boolean {
    if (!this._curr) return false;
    const tt = this._curr.tokenType;
    const found =
      types instanceof Set ? types.has(tt) : tt in types;
    if (found) {
      if (advance) this._advance();
      return true;
    }
    return false;
  }

  private _matchTextSeq(...texts: string[]): boolean {
    const index = this._index;
    for (const text of texts) {
      if (
        this._curr &&
        this._curr.tokenType !== TokenType.STRING &&
        this._curr.text.toUpperCase() === text
      ) {
        this._advance();
      } else {
        this._retreat(index);
        return false;
      }
    }
    return true;
  }

  private _matchTexts(texts: Set<string> | string[]): boolean {
    if (
      this._curr &&
      this._curr.tokenType !== TokenType.STRING
    ) {
      const upper = this._curr.text.toUpperCase();
      const found = texts instanceof Set ? texts.has(upper) : texts.includes(upper);
      if (found) {
        this._advance();
        return true;
      }
    }
    return false;
  }

  private _advanceAny(): Token | null {
    if (this._curr && !RESERVED_TOKENS.has(this._curr.tokenType)) {
      this._advance();
      return this._prev;
    }
    return null;
  }

  // ── error handling ────────────────────────────────────────────────────

  raiseError(message: string, token?: Token | null): void {
    token = token ?? this._curr ?? this._prev ?? Token.string("");
    const [formattedSql, startContext, highlight, endContext] = highlightSql(
      this.sql,
      [[token!.start, token!.end]],
      this.errorMessageContext,
    );
    const formattedMessage = `${message}. Line ${token!.line}, Col: ${token!.col}.\n  ${formattedSql}`;

    const error = ParseError.new(
      formattedMessage,
      message,
      token!.line,
      token!.col,
      startContext,
      highlight,
      endContext,
    );

    if (this.errorLevel === ErrorLevel.IMMEDIATE) {
      throw error;
    }
    this.errors.push(error);
  }

  private _checkErrors(): void {
    if (this.errorLevel === ErrorLevel.RAISE && this.errors.length > 0) {
      throw new ParseError(
        concatMessages(this.errors, this.maxErrors),
        mergeErrors(this.errors),
      );
    }
  }

  // ── expression factory ────────────────────────────────────────────────

  expression<T extends Expression>(
    klass: new (...args: any[]) => T,
    kwargs: Record<string, any> = {},
  ): T {
    const instance = new klass(kwargs);
    return instance;
  }

  // ── CSV parsing ───────────────────────────────────────────────────────

  private _parseCsv(
    parseMethod: () => Expression | null,
    sep: TokenType = TokenType.COMMA,
  ): Expression[] {
    const result = parseMethod.call(this);
    const items: Expression[] = result != null ? [result] : [];
    while (this._match(sep)) {
      const item = parseMethod.call(this);
      if (item != null) items.push(item);
    }
    return items;
  }

  private _parseWrapped<T>(
    parseMethod: () => T,
    optional: boolean = false,
  ): T {
    const wrapped = this._match(TokenType.L_PAREN);
    if (!wrapped && !optional) {
      this.raiseError("Expecting (");
    }
    const result = parseMethod.call(this);
    if (wrapped) {
      if (!this._match(TokenType.R_PAREN)) {
        this.raiseError("Expecting )");
      }
    }
    return result;
  }

  private _parseWrappedCsv(
    parseMethod: () => Expression | null,
    sep: TokenType = TokenType.COMMA,
  ): Expression[] {
    return this._parseWrapped(() => this._parseCsv(parseMethod, sep));
  }

  // ── statement parsing ─────────────────────────────────────────────────

  private _parseStatement(): Expression | null {
    if (this._curr === null) return null;

    // SELECT keyword
    const expression = this._parseExpression();
    const withSetOps = expression
      ? this._parseSetOperations(expression)
      : this._parseSelect();
    return this._parseQueryModifiers(withSetOps);
  }

  // ── SELECT ────────────────────────────────────────────────────────────

  private _parseSelect(): Expression | null {
    // WITH (CTE) handling
    const cte = this._parseWith();
    if (cte) {
      const stmt = this._parseStatement();
      if (stmt && "with_" in (stmt.constructor as any).argTypes) {
        stmt.set("with_", cte);
      }
      return stmt;
    }

    if (!this._match(TokenType.SELECT)) {
      return null;
    }

    const comments = this._prevComments;

    // DISTINCT / ALL
    const all = this._match(TokenType.ALL);
    const distinct = this._match(TokenType.DISTINCT);

    if (all && distinct) {
      this.raiseError("Cannot specify both ALL and DISTINCT after SELECT");
    }

    let distinctExpr: Expression | null = null;
    if (distinct) {
      distinctExpr = this.expression(exp.Distinct, {});
    }

    // Parse projections
    const projections = this._parseCsv(() => this._parseExpression());

    const select = this.expression(exp.Select, {
      expressions: projections,
      distinct: distinctExpr,
    });
    if (comments) {
      select.comments = comments;
    }

    // FROM
    const from = this._parseFrom();
    if (from) select.set("from_", from);

    // Query modifiers: WHERE, GROUP BY, HAVING, ORDER BY, LIMIT, OFFSET, joins
    this._parseQueryModifiers(select);

    // Check for set operations (UNION, INTERSECT, EXCEPT)
    return this._parseSetOperations(select);
  }

  // ── WITH (CTE) ───────────────────────────────────────────────────────

  private _parseWith(): Expression | null {
    if (!this._match(TokenType.WITH)) return null;
    const recursive = this._match(TokenType.RECURSIVE);
    const expressions = this._parseCsv(() => this._parseCte());
    return this.expression(exp.With, { expressions, recursive: recursive || undefined });
  }

  private _parseCte(): Expression | null {
    const alias = this._parseTableAlias();
    if (!alias) return null;
    if (!this._match(TokenType.ALIAS)) {
      // AS keyword required for CTE
      this.raiseError("Expected AS in CTE definition");
    }
    // The CTE body is a parenthesized select
    if (!this._match(TokenType.L_PAREN)) {
      this.raiseError("Expecting ( after AS in CTE");
    }
    const body = this._parseSelect() ?? this._parseStatement();
    if (!this._match(TokenType.R_PAREN)) {
      this.raiseError("Expecting ) after CTE body");
    }
    return this.expression(exp.CTE, { this: body, alias });
  }

  // ── FROM ──────────────────────────────────────────────────────────────

  private _parseFrom(): Expression | null {
    if (!this._match(TokenType.FROM)) return null;
    return this.expression(exp.From, {
      this: this._parseTable(),
    });
  }

  // ── TABLE ─────────────────────────────────────────────────────────────

  private _parseTable(): Expression | null {
    // Subquery
    if (this._match(TokenType.L_PAREN, false)) {
      return this._parseTableSubquery();
    }

    const tableParts = this._parseTableParts();
    if (!tableParts) return null;

    const alias = this._parseTableAlias();
    if (alias) tableParts.set("alias", alias);

    return tableParts;
  }

  private _parseTableSubquery(): Expression | null {
    if (!this._match(TokenType.L_PAREN)) return null;
    const select = this._parseSelect() ?? this._parseStatement();
    if (!this._match(TokenType.R_PAREN)) {
      this.raiseError("Expecting )");
    }
    const subquery = this.expression(exp.Subquery, { this: select });
    const alias = this._parseTableAlias();
    if (alias) subquery.set("alias", alias);
    return subquery;
  }

  private _parseTableParts(): Expression | null {
    // Parse dotted name: catalog.db.table
    const ident = this._parseIdentifierOrVar();
    if (!ident) return null;

    let db: Expression | null = null;
    let catalog: Expression | null = null;

    if (this._match(TokenType.DOT)) {
      const second = this._parseIdentifierOrVar();
      if (this._match(TokenType.DOT)) {
        catalog = ident;
        db = second;
        const third = this._parseIdentifierOrVar();
        return this.expression(exp.Table, {
          this: third,
          db,
          catalog,
        });
      }
      return this.expression(exp.Table, {
        this: second,
        db: ident,
      });
    }

    return this.expression(exp.Table, { this: ident });
  }

  // ── TABLE ALIAS ───────────────────────────────────────────────────────

  private _parseTableAlias(): Expression | null {
    const anyToken = this._match(TokenType.ALIAS);
    const ident = this._parseIdentifierOrVar();
    if (!ident && !anyToken) return null;
    if (!ident) return null;

    // Column aliases: alias(c1, c2, ...)
    let columns: Expression[] | undefined;
    if (this._match(TokenType.L_PAREN)) {
      columns = this._parseCsv(() => this._parseIdentifierOrVar());
      if (!this._match(TokenType.R_PAREN)) {
        this.raiseError("Expecting )");
      }
    }

    return this.expression(exp.TableAlias, {
      this: ident,
      columns,
    });
  }

  // ── JOIN ──────────────────────────────────────────────────────────────

  private _parseJoins(): Expression[] {
    const joins: Expression[] = [];
    while (true) {
      const join = this._parseJoin();
      if (!join) break;
      joins.push(join);
    }
    return joins;
  }

  private _parseJoin(): Expression | null {
    // Comma join
    if (this._match(TokenType.COMMA)) {
      const table = this._parseTable();
      if (table) {
        return this.expression(exp.Join, { this: table });
      }
      return null;
    }

    const index = this._index;

    // method: NATURAL
    const method = this._match(TokenType.NATURAL)
      ? this._prev!.text.toUpperCase()
      : null;

    // side: LEFT, RIGHT, FULL
    let side: string | null = null;
    if (this._matchSet(JOIN_SIDES)) {
      side = this._prev!.text.toUpperCase();
    }

    // kind: INNER, OUTER, CROSS, SEMI, ANTI
    let kind: string | null = null;
    if (this._matchSet(JOIN_KINDS)) {
      kind = this._prev!.text.toUpperCase();
    }

    // Must see JOIN keyword
    if (!this._match(TokenType.JOIN)) {
      this._retreat(index);
      return null;
    }

    const table = this._parseTable();

    const kwargs: Record<string, any> = { this: table };
    if (method) kwargs["method"] = method;
    if (side) kwargs["side"] = side;
    if (kind) kwargs["kind"] = kind;

    // ON / USING
    if (this._match(TokenType.ON)) {
      kwargs["on"] = this._parseDisjunction();
    } else if (this._match(TokenType.USING)) {
      kwargs["using"] = this._parseWrappedCsv(() => this._parseIdentifierOrVar());
    }

    return this.expression(exp.Join, kwargs);
  }

  // ── WHERE ─────────────────────────────────────────────────────────────

  private _parseWhere(): Expression | null {
    if (!this._match(TokenType.WHERE)) return null;
    return this.expression(exp.Where, {
      this: this._parseDisjunction(),
    });
  }

  // ── GROUP BY ──────────────────────────────────────────────────────────

  private _parseGroup(): Expression | null {
    if (!this._match(TokenType.GROUP_BY)) return null;
    const expressions = this._parseCsv(() => this._parseDisjunction());
    return this.expression(exp.Group, { expressions });
  }

  // ── HAVING ────────────────────────────────────────────────────────────

  private _parseHaving(): Expression | null {
    if (!this._match(TokenType.HAVING)) return null;
    return this.expression(exp.Having, {
      this: this._parseDisjunction(),
    });
  }

  // ── ORDER BY ──────────────────────────────────────────────────────────

  private _parseOrder(): Expression | null {
    if (!this._match(TokenType.ORDER_BY)) return null;
    const expressions = this._parseCsv(() => this._parseOrdered());
    return this.expression(exp.Order, { expressions });
  }

  private _parseOrdered(): Expression | null {
    const expr = this._parseDisjunction();
    if (!expr) return null;

    const asc = this._match(TokenType.ASC);
    const desc = this._match(TokenType.DESC);

    let nullsFirst: boolean | undefined;
    if (this._matchTextSeq("NULLS", "FIRST")) {
      nullsFirst = true;
    } else if (this._matchTextSeq("NULLS", "LAST")) {
      nullsFirst = false;
    }

    return this.expression(exp.Ordered, {
      this: expr,
      desc: desc || undefined,
      nulls_first: nullsFirst,
    });
  }

  // ── LIMIT / OFFSET ───────────────────────────────────────────────────

  private _parseLimit(): Expression | null {
    if (!this._match(TokenType.LIMIT)) return null;
    const expr = this._parsePrimary();
    return this.expression(exp.Limit, { expression: expr });
  }

  private _parseOffset(): Expression | null {
    if (!this._match(TokenType.OFFSET)) return null;
    const expr = this._parsePrimary();
    return this.expression(exp.Offset, { expression: expr });
  }

  // ── QUERY MODIFIERS ───────────────────────────────────────────────────

  private _parseQueryModifiers(thisExpr: Expression | null): Expression | null {
    if (!thisExpr) return thisExpr;

    // Joins
    const joins = this._parseJoins();
    for (const join of joins) {
      thisExpr.append("joins", join);
    }

    // WHERE, GROUP BY, HAVING, ORDER BY, LIMIT, OFFSET
    let keepGoing = true;
    while (keepGoing) {
      keepGoing = false;

      if (this._curr?.tokenType === TokenType.WHERE && !thisExpr.args["where"]) {
        thisExpr.set("where", this._parseWhere());
        keepGoing = true;
      }
      if (this._curr?.tokenType === TokenType.GROUP_BY && !thisExpr.args["group"]) {
        thisExpr.set("group", this._parseGroup());
        keepGoing = true;
      }
      if (this._curr?.tokenType === TokenType.HAVING && !thisExpr.args["having"]) {
        thisExpr.set("having", this._parseHaving());
        keepGoing = true;
      }
      if (this._curr?.tokenType === TokenType.ORDER_BY && !thisExpr.args["order"]) {
        thisExpr.set("order", this._parseOrder());
        keepGoing = true;
      }
      if (this._curr?.tokenType === TokenType.LIMIT && !thisExpr.args["limit"]) {
        thisExpr.set("limit", this._parseLimit());
        keepGoing = true;
      }
      if (this._curr?.tokenType === TokenType.OFFSET && !thisExpr.args["offset"]) {
        thisExpr.set("offset", this._parseOffset());
        keepGoing = true;
      }
    }

    return thisExpr;
  }

  // ── SET OPERATIONS (UNION, INTERSECT, EXCEPT) ─────────────────────────

  private _parseSetOperations(thisExpr: Expression | null): Expression | null {
    if (!thisExpr) return thisExpr;

    while (true) {
      let klass: any = null;
      if (this._match(TokenType.UNION)) {
        klass = exp.Union;
      } else if (this._match(TokenType.INTERSECT)) {
        klass = exp.Intersect;
      } else if (this._match(TokenType.EXCEPT)) {
        klass = exp.Except;
      } else {
        break;
      }

      const distinct = !this._match(TokenType.ALL);
      const right = this._parseSelect() ?? this._parseStatement();

      thisExpr = this.expression(klass, {
        this: thisExpr,
        expression: right,
        distinct,
      });
    }

    return thisExpr;
  }

  // ── EXPRESSION PARSING (precedence climbing) ──────────────────────────

  private _parseExpression(): Expression | null {
    return this._parseAlias(this._parseDisjunction());
  }

  private _parseDisjunction(): Expression | null {
    return this._parseTokens(() => this._parseConjunction(), (this.constructor as typeof Parser).DISJUNCTION);
  }

  private _parseConjunction(): Expression | null {
    return this._parseTokens(() => this._parseEquality(), (this.constructor as typeof Parser).CONJUNCTION);
  }

  private _parseEquality(): Expression | null {
    return this._parseTokens(() => this._parseComparison(), (this.constructor as typeof Parser).EQUALITY);
  }

  private _parseComparison(): Expression | null {
    return this._parseTokens(() => this._parseRange(), (this.constructor as typeof Parser).COMPARISON);
  }

  private _parseRange(): Expression | null {
    let thisExpr = this._parseBitwise();
    const negate = this._match(TokenType.NOT);

    // IS
    if (this._match(TokenType.IS)) {
      thisExpr = this._parseIs(thisExpr);
      if (negate && thisExpr) {
        thisExpr = this.expression(exp.Not, { this: thisExpr });
      }
      return thisExpr;
    }

    // BETWEEN
    if (this._match(TokenType.BETWEEN)) {
      const low = this._parseBitwise();
      this._match(TokenType.AND);
      const high = this._parseBitwise();
      thisExpr = this.expression(exp.Between, {
        this: thisExpr,
        low,
        high,
      });
      if (negate && thisExpr) {
        thisExpr = this.expression(exp.Not, { this: thisExpr });
      }
      return thisExpr;
    }

    // IN
    if (this._match(TokenType.IN)) {
      thisExpr = this._parseIn(thisExpr);
      if (negate && thisExpr) {
        thisExpr = this.expression(exp.Not, { this: thisExpr });
      }
      return thisExpr;
    }

    // LIKE / ILIKE
    if (this._match(TokenType.LIKE)) {
      const pattern = this._parseBitwise();
      thisExpr = this.expression(exp.Like, {
        this: thisExpr,
        expression: pattern,
      });
      if (negate && thisExpr) {
        thisExpr = this.expression(exp.Not, { this: thisExpr });
      }
      return thisExpr;
    }

    if (this._match(TokenType.ILIKE)) {
      const pattern = this._parseBitwise();
      thisExpr = this.expression(exp.ILike, {
        this: thisExpr,
        expression: pattern,
      });
      if (negate && thisExpr) {
        thisExpr = this.expression(exp.Not, { this: thisExpr });
      }
      return thisExpr;
    }

    // EXISTS as a standalone keyword handled in _parseUnary

    if (negate && thisExpr) {
      thisExpr = this.expression(exp.Not, { this: thisExpr });
    }

    return thisExpr;
  }

  private _parseIs(thisExpr: Expression | null): Expression | null {
    const negate = this._match(TokenType.NOT);
    const expr = this._parsePrimary() ?? this._parseBitwise();
    let result = this.expression(exp.Is, {
      this: thisExpr,
      expression: expr,
    });
    if (negate) {
      result = this.expression(exp.Not, { this: result }) as any;
    }
    return result;
  }

  private _parseIn(thisExpr: Expression | null): Expression {
    if (this._match(TokenType.L_PAREN)) {
      // Could be a subquery or expression list
      const first = this._parseSelect();
      if (first) {
        // Subquery
        const subquery = this.expression(exp.Subquery, { this: first });
        if (!this._match(TokenType.R_PAREN)) {
          this.raiseError("Expecting )");
        }
        return this.expression(exp.In, {
          this: thisExpr,
          query: subquery,
        });
      }

      // Expression list
      // Need to retreat since _parseSelect consumed nothing useful but may have advanced
      const expressions = this._parseCsv(() => this._parseDisjunction());
      if (!this._match(TokenType.R_PAREN)) {
        this.raiseError("Expecting )");
      }
      return this.expression(exp.In, {
        this: thisExpr,
        expressions,
      });
    }

    return this.expression(exp.In, {
      this: thisExpr,
      field: this._parseColumn(),
    });
  }

  private _parseBitwise(): Expression | null {
    return this._parseTerm();
  }

  private _parseTerm(): Expression | null {
    let thisExpr = this._parseFactor();
    while (this._matchSet((this.constructor as typeof Parser).TERM)) {
      const className = (this.constructor as typeof Parser).TERM[this._prev!.tokenType];
      const right = this._parseFactor();
      thisExpr = this.expression(exp[className], {
        this: thisExpr,
        expression: right,
      });
    }
    return thisExpr;
  }

  private _parseFactor(): Expression | null {
    let thisExpr = this._parseUnary();
    while (this._matchSet((this.constructor as typeof Parser).FACTOR)) {
      const className = (this.constructor as typeof Parser).FACTOR[this._prev!.tokenType];
      const right = this._parseUnary();
      thisExpr = this.expression(exp[className], {
        this: thisExpr,
        expression: right,
      });
    }
    return thisExpr;
  }

  private _parseUnary(): Expression | null {
    // NOT
    if (this._match(TokenType.NOT)) {
      return this.expression(exp.Not, { this: this._parseEquality() });
    }
    // Unary minus
    if (this._match(TokenType.DASH)) {
      return this.expression(exp.Neg, { this: this._parseUnary() });
    }
    // EXISTS
    if (this._match(TokenType.EXISTS)) {
      if (this._match(TokenType.L_PAREN)) {
        const subquery = this._parseSelect() ?? this._parseStatement();
        if (!this._match(TokenType.R_PAREN)) {
          this.raiseError("Expecting )");
        }
        return this.expression(exp.Exists, {
          this: this.expression(exp.Subquery, { this: subquery }),
        });
      }
    }
    return this._parseType();
  }

  private _parseType(): Expression | null {
    // CAST
    if (
      this._curr &&
      this._curr.text.toUpperCase() === "CAST" &&
      this._next?.tokenType === TokenType.L_PAREN
    ) {
      return this._parseCast();
    }
    // CASE
    if (
      this._curr &&
      this._curr.text.toUpperCase() === "CASE" &&
      this._curr.tokenType !== TokenType.STRING
    ) {
      this._advance();
      return this._parseCase();
    }
    // INTERVAL
    if (this._match(TokenType.INTERVAL)) {
      const thisVal = this._parsePrimary();
      // Try to parse unit
      let unit: Expression | null = null;
      if (this._curr && this._curr.tokenType !== TokenType.STRING && !this._done) {
        // Check if current token looks like a unit (e.g. DAY, HOUR, etc.)
        const upper = this._curr.text.toUpperCase();
        if (INTERVAL_UNITS.has(upper)) {
          unit = this.expression(exp.Var, { this: upper });
          this._advance();
        }
      }
      return this.expression(exp.Interval, { this: thisVal, unit });
    }
    // EXTRACT
    if (
      this._curr &&
      this._curr.text.toUpperCase() === "EXTRACT" &&
      this._next?.tokenType === TokenType.L_PAREN
    ) {
      return this._parseExtract();
    }

    return this._parseColumnOrFunction();
  }

  private _parseCast(): Expression | null {
    this._advance(); // skip CAST
    this._advance(); // skip (
    const thisExpr = this._parseDisjunction();
    this._matchTextSeq("AS");
    const to = this._parseDataType();
    if (!this._match(TokenType.R_PAREN)) {
      this.raiseError("Expecting ) after CAST");
    }
    return this.expression(exp.Cast, { this: thisExpr, to });
  }

  private _parseExtract(): Expression | null {
    this._advance(); // skip EXTRACT
    this._advance(); // skip (
    // part FROM expr
    const part = this._parseVar();
    this._matchTextSeq("FROM");
    const thisExpr = this._parseDisjunction();
    if (!this._match(TokenType.R_PAREN)) {
      this.raiseError("Expecting ) after EXTRACT");
    }
    return this.expression(exp.Extract, { this: part, expression: thisExpr });
  }

  private _parseCase(): Expression | null {
    // CASE [operand] WHEN ... THEN ... [ELSE ...] END
    let operand: Expression | null = null;

    // Simple CASE: CASE expr WHEN val THEN result ...
    if (this._curr && this._curr.tokenType !== TokenType.WHEN) {
      operand = this._parseDisjunction();
    }

    const ifs: Expression[] = [];
    while (this._match(TokenType.WHEN)) {
      const condition = this._parseDisjunction();
      if (!this._match(TokenType.THEN)) {
        this.raiseError("Expecting THEN after WHEN condition");
      }
      const result = this._parseDisjunction();
      ifs.push(
        this.expression(exp.If, {
          this: condition,
          true: result,
        }),
      );
    }

    let defaultVal: Expression | null = null;
    if (this._match(TokenType.ELSE)) {
      defaultVal = this._parseDisjunction();
    }

    if (!this._match(TokenType.END)) {
      this.raiseError("Expecting END after CASE expression");
    }

    return this.expression(exp.Case, {
      this: operand,
      ifs,
      default: defaultVal,
    });
  }

  private _parseDataType(): Expression | null {
    // Simple data type parsing: INT, VARCHAR(n), etc.
    if (!this._curr) return null;
    const typeName = this._curr.text.toUpperCase();
    this._advance();

    let expressions: Expression[] | undefined;
    if (this._match(TokenType.L_PAREN)) {
      expressions = this._parseCsv(() => this._parsePrimary());
      if (!this._match(TokenType.R_PAREN)) {
        this.raiseError("Expecting ) after data type parameters");
      }
    }

    return this.expression(exp.DataType, {
      this: typeName,
      expressions,
    });
  }

  private _parseVar(): Expression | null {
    if (this._curr && this._curr.tokenType !== TokenType.STRING) {
      const text = this._curr.text;
      this._advance();
      return this.expression(exp.Var, { this: text });
    }
    return null;
  }

  // ── COLUMN / FUNCTION ─────────────────────────────────────────────────

  private _parseColumnOrFunction(): Expression | null {
    const primary = this._parsePrimary();
    if (primary) return this._parseColumnOps(primary);

    // Function or column
    const func = this._parseFunction();
    if (func) return func;

    const column = this._parseColumn();
    return column ? this._parseColumnOps(column) : null;
  }

  private _parseColumnOps(thisExpr: Expression | null): Expression | null {
    if (!thisExpr) return thisExpr;

    // Handle dot notation: col.field or table.col
    while (this._match(TokenType.DOT)) {
      const field =
        this._parseFunction() ?? this._parseIdentifierOrVar();
      if (!field) break;

      if (thisExpr instanceof exp.Column && !thisExpr.args["catalog"]) {
        thisExpr = this.expression(exp.Column, {
          this: field,
          table: thisExpr.args["this"],
          db: thisExpr.args["table"],
          catalog: thisExpr.args["db"],
        });
      } else {
        thisExpr = this.expression(exp.Dot, {
          this: thisExpr,
          expression: field,
        });
      }
    }

    return thisExpr;
  }

  private _parseColumn(): Expression | null {
    const field = this._parseField();
    if (!field) return null;
    if (field instanceof exp.Identifier) {
      return this.expression(exp.Column, { this: field });
    }
    return field;
  }

  private _parseField(): Expression | null {
    return this._parsePrimary() ?? this._parseFunction() ?? this._parseIdentifierOrVar();
  }

  private _parseFunction(): Expression | null {
    if (!this._curr || !this._next) return null;
    if (this._next.tokenType !== TokenType.L_PAREN) return null;
    if (this._curr.tokenType === TokenType.STRING) return null;

    // Don't parse reserved tokens as function names (except specific func tokens)
    if (RESERVED_TOKENS.has(this._curr.tokenType) && !FUNC_TOKENS.has(this._curr.tokenType)) {
      return null;
    }

    const name = this._curr.text;
    const upper = name.toUpperCase();

    this._advance(2); // skip name and (

    // COUNT special handling for COUNT(*)
    if (upper === "COUNT") {
      return this._parseCountFunc(name);
    }

    // Generic function
    const args = this._parseCsv(() => this._parseExpression());
    if (!this._match(TokenType.R_PAREN)) {
      this.raiseError("Expecting ) after function arguments");
    }

    // Check for known function classes
    const funcClass = FUNCTION_MAP[upper];
    if (funcClass && exp[funcClass]) {
      const kwargs: Record<string, any> = { this: seqGet(args, 0) };
      if (args.length > 1) {
        kwargs["expressions"] = args.slice(1);
      }
      return this._parseWindow(this.expression(exp[funcClass], kwargs));
    }

    // Anonymous function
    return this._parseWindow(
      this.expression(exp.Anonymous, { this: name, expressions: args }),
    );
  }

  private _parseCountFunc(name: string): Expression {
    let distinct: Expression | null = null;
    if (this._match(TokenType.DISTINCT)) {
      distinct = this.expression(exp.Distinct, {});
    }

    let thisExpr: Expression | null = null;
    if (this._match(TokenType.STAR)) {
      thisExpr = this.expression(exp.Star, {});
    } else if (!this._match(TokenType.R_PAREN, false)) {
      thisExpr = this._parseDisjunction();
    }

    if (!this._match(TokenType.R_PAREN)) {
      this.raiseError("Expecting ) after COUNT");
    }

    const countExpr = this.expression(exp.Count, {
      this: distinct ?? thisExpr,
      expressions: distinct && thisExpr ? [thisExpr] : undefined,
    });

    return this._parseWindow(countExpr);
  }

  // ── WINDOW ────────────────────────────────────────────────────────────

  private _parseWindow(thisExpr: Expression): Expression {
    if (!this._match(TokenType.OVER)) return thisExpr;

    if (!this._match(TokenType.L_PAREN)) {
      // Could be OVER window_name
      const alias = this._parseIdentifierOrVar();
      return this.expression(exp.Window, { this: thisExpr, alias });
    }

    // PARTITION BY
    let partitionBy: Expression[] | undefined;
    if (this._match(TokenType.PARTITION_BY)) {
      partitionBy = this._parseCsv(() => this._parseDisjunction());
    }

    // ORDER BY
    let order: Expression | undefined;
    if (this._curr?.tokenType === TokenType.ORDER_BY) {
      order = this._parseOrder() ?? undefined;
    }

    if (!this._match(TokenType.R_PAREN)) {
      this.raiseError("Expecting ) after OVER clause");
    }

    return this.expression(exp.Window, {
      this: thisExpr,
      partition_by: partitionBy,
      order,
    });
  }

  // ── PRIMARY ───────────────────────────────────────────────────────────

  private _parsePrimary(): Expression | null {
    // NULL
    if (this._match(TokenType.NULL)) {
      return this.expression(exp.Null, {});
    }
    // TRUE / FALSE
    if (this._match(TokenType.TRUE)) {
      return this.expression(exp.Boolean, { this: true });
    }
    if (this._match(TokenType.FALSE)) {
      return this.expression(exp.Boolean, { this: false });
    }
    // Number
    if (this._match(TokenType.NUMBER)) {
      return this.expression(exp.Literal, {
        this: this._prev!.text,
        is_string: false,
      });
    }
    // String
    if (this._match(TokenType.STRING)) {
      return this.expression(exp.Literal, {
        this: this._prev!.text,
        is_string: true,
      });
    }
    // Star
    if (this._match(TokenType.STAR)) {
      return this.expression(exp.Star, {});
    }
    // Parenthesized expression / subquery / tuple
    if (this._match(TokenType.L_PAREN)) {
      return this._parseParen();
    }
    return null;
  }

  private _parseParen(): Expression | null {
    // Try subquery first
    if (this._curr?.tokenType === TokenType.SELECT || this._curr?.tokenType === TokenType.WITH) {
      const query = this._parseSelect();
      if (!this._match(TokenType.R_PAREN)) {
        this.raiseError("Expecting )");
      }
      return this.expression(exp.Subquery, { this: query });
    }

    const expressions = this._parseCsv(() => this._parseExpression());
    if (!this._match(TokenType.R_PAREN)) {
      this.raiseError("Expecting )");
    }

    if (expressions.length === 0) {
      return this.expression(exp.Tuple, { expressions: [] });
    }
    if (expressions.length === 1) {
      return this.expression(exp.Paren, { this: expressions[0] });
    }
    return this.expression(exp.Tuple, { expressions });
  }

  // ── ALIAS ─────────────────────────────────────────────────────────────

  private _parseAlias(thisExpr: Expression | null): Expression | null {
    if (!thisExpr) return thisExpr;

    const anyToken = this._match(TokenType.ALIAS);

    const alias = this._parseIdentifierOrVar();
    if (!alias && !anyToken) return thisExpr;
    if (!alias) return thisExpr;

    return this.expression(exp.Alias, {
      this: thisExpr,
      alias,
    });
  }

  // ── IDENTIFIER ────────────────────────────────────────────────────────

  private _parseIdentifierOrVar(): Expression | null {
    // Quoted identifier
    if (this._match(TokenType.IDENTIFIER)) {
      return this.expression(exp.Identifier, {
        this: this._prev!.text,
        quoted: true,
      });
    }
    // VAR or other ID-like tokens
    if (this._match(TokenType.VAR)) {
      return this.expression(exp.Identifier, {
        this: this._prev!.text,
        quoted: false,
      });
    }
    // Many keywords can also be identifiers
    if (this._curr && ID_VAR_TOKENS.has(this._curr.tokenType)) {
      const text = this._curr.text;
      this._advance();
      return this.expression(exp.Identifier, {
        this: text,
        quoted: false,
      });
    }
    return null;
  }

  // ── HELPER: _parseTokens (for binary precedence climbing) ─────────────

  private _parseTokens(
    parseMethod: () => Expression | null,
    expressions: Record<string, string>,
  ): Expression | null {
    let thisExpr = parseMethod.call(this);

    while (this._matchSet(expressions)) {
      const className = expressions[this._prev!.tokenType]!;
      const right = parseMethod.call(this);
      thisExpr = this.expression(exp[className], {
        this: thisExpr,
        expression: right,
      });
    }

    return thisExpr;
  }
}

// ── Token sets ────────────────────────────────────────────────────────────

const RESERVED_TOKENS = new Set<TokenType>([
  TokenType.L_PAREN,
  TokenType.R_PAREN,
  TokenType.L_BRACKET,
  TokenType.R_BRACKET,
  TokenType.COMMA,
  TokenType.DOT,
  TokenType.SEMICOLON,
  TokenType.COLON,
  TokenType.STAR,
  TokenType.PLUS,
  TokenType.DASH,
  TokenType.SLASH,
  TokenType.EQ,
  TokenType.NEQ,
  TokenType.LT,
  TokenType.LTE,
  TokenType.GT,
  TokenType.GTE,
  TokenType.AMP,
  TokenType.PIPE,
  TokenType.SELECT,
]);

const FUNC_TOKENS = new Set<TokenType>([
  TokenType.VAR,
  TokenType.IDENTIFIER,
  TokenType.LEFT,
  TokenType.RIGHT,
  TokenType.DATE,
  TokenType.DATETIME,
  TokenType.TIMESTAMP,
  TokenType.TIMESTAMPTZ,
  TokenType.REPLACE,
  TokenType.EXISTS,
  TokenType.ILIKE,
  TokenType.LIKE,
  TokenType.TABLE,
  TokenType.TRUNCATE,
  TokenType.FORMAT,
  TokenType.FILTER,
  TokenType.FIRST,
  TokenType.ARRAY,
  TokenType.STRUCT,
  TokenType.NULL,
  TokenType.INTERVAL,
  TokenType.INT,
  TokenType.FLOAT,
  TokenType.BOOLEAN,
  TokenType.VARCHAR,
  TokenType.CHAR,
  TokenType.TEXT,
  TokenType.BIGINT,
  TokenType.SMALLINT,
  TokenType.TINYINT,
  TokenType.DOUBLE,
  TokenType.DECIMAL,
]);

const JOIN_SIDES = new Set<TokenType>([
  TokenType.LEFT,
  TokenType.RIGHT,
  TokenType.FULL,
]);

const JOIN_KINDS = new Set<TokenType>([
  TokenType.INNER,
  TokenType.OUTER,
  TokenType.CROSS,
  TokenType.SEMI,
  TokenType.ANTI,
]);

// ID_VAR_TOKENS: tokens that can serve as identifiers
const ID_VAR_TOKENS = new Set<TokenType>([
  TokenType.VAR,
  TokenType.IDENTIFIER,
  TokenType.ALL,
  TokenType.ASC,
  TokenType.DESC,
  TokenType.ANTI,
  TokenType.APPLY,
  TokenType.BEGIN,
  TokenType.CACHE,
  TokenType.COLLATE,
  TokenType.COMMAND,
  TokenType.COMMENT,
  TokenType.COMMIT,
  TokenType.CONSTRAINT,
  TokenType.COPY,
  TokenType.CUBE,
  TokenType.DEFAULT,
  TokenType.DELETE,
  TokenType.DIV,
  TokenType.END,
  TokenType.EXECUTE,
  TokenType.ESCAPE,
  TokenType.FALSE,
  TokenType.FIRST,
  TokenType.FILTER,
  TokenType.FINAL,
  TokenType.FORMAT,
  TokenType.FULL,
  TokenType.GET,
  TokenType.IS,
  TokenType.INTERVAL,
  TokenType.KEEP,
  TokenType.LEFT,
  TokenType.LIMIT,
  TokenType.LOAD,
  TokenType.LOCK,
  TokenType.MERGE,
  TokenType.NATURAL,
  TokenType.NEXT,
  TokenType.OFFSET,
  TokenType.OPERATOR,
  TokenType.ORDINALITY,
  TokenType.OVER,
  TokenType.OVERLAPS,
  TokenType.OVERWRITE,
  TokenType.PARTITION,
  TokenType.PERCENT,
  TokenType.PIVOT,
  TokenType.RANGE,
  TokenType.RECURSIVE,
  TokenType.REFERENCES,
  TokenType.RENAME,
  TokenType.REPLACE,
  TokenType.RIGHT,
  TokenType.ROLLUP,
  TokenType.ROW,
  TokenType.ROWS,
  TokenType.SEMI,
  TokenType.SET,
  TokenType.SETTINGS,
  TokenType.SHOW,
  TokenType.TEMPORARY,
  TokenType.TOP,
  TokenType.TRUE,
  TokenType.TRUNCATE,
  TokenType.UNIQUE,
  TokenType.UNNEST,
  TokenType.UNPIVOT,
  TokenType.UPDATE,
  TokenType.USE,
  TokenType.VOLATILE,
  TokenType.WINDOW,
  // type tokens that can also be identifiers
  TokenType.BOOLEAN,
  TokenType.INT,
  TokenType.BIGINT,
  TokenType.SMALLINT,
  TokenType.TINYINT,
  TokenType.FLOAT,
  TokenType.DOUBLE,
  TokenType.DECIMAL,
  TokenType.CHAR,
  TokenType.VARCHAR,
  TokenType.NCHAR,
  TokenType.NVARCHAR,
  TokenType.TEXT,
  TokenType.BINARY,
  TokenType.VARBINARY,
  TokenType.JSON,
  TokenType.JSONB,
  TokenType.DATE,
  TokenType.DATETIME,
  TokenType.TIMESTAMP,
  TokenType.TIMESTAMPTZ,
  TokenType.TIMESTAMPLTZ,
  TokenType.TIMESTAMPNTZ,
  TokenType.TIME,
  TokenType.TIMETZ,
  TokenType.UUID,
  TokenType.XML,
  TokenType.YEAR,
  TokenType.ARRAY,
  TokenType.MAP,
  TokenType.STRUCT,
  TokenType.VARIANT,
  TokenType.OBJECT,
  TokenType.NULL,
  TokenType.TABLE,
  TokenType.VIEW,
  TokenType.DATABASE,
  TokenType.SCHEMA,
  TokenType.INDEX,
  TokenType.COLUMN,
  TokenType.FUNCTION,
  TokenType.PROCEDURE,
  TokenType.SEQUENCE,
  TokenType.MODEL,
  TokenType.EXISTS,
  TokenType.ANY,
  TokenType.SOME,
  TokenType.ISNULL,
  TokenType.CURRENT_DATE,
  TokenType.CURRENT_DATETIME,
  TokenType.CURRENT_TIME,
  TokenType.CURRENT_TIMESTAMP,
  TokenType.CURRENT_USER,
  TokenType.CURRENT_ROLE,
  TokenType.INOUT,
  TokenType.ANALYZE,
]);

// Known function names -> expression class names
const FUNCTION_MAP: Record<string, string> = {
  SUM: "Sum",
  AVG: "Avg",
  MIN: "Min",
  MAX: "Max",
  COUNT: "Count",
  COALESCE: "Coalesce",
  IF: "If",
  NULLIF: "NullIf",
  ABS: "Abs",
  CEIL: "Ceil",
  FLOOR: "Floor",
  ROUND: "Round",
  LENGTH: "Length",
  LOWER: "Lower",
  UPPER: "Upper",
  TRIM: "Trim",
  SUBSTRING: "Substring",
  REPLACE: "Replace",
  CONCAT: "Concat",
};

const INTERVAL_UNITS = new Set([
  "YEAR",
  "YEARS",
  "MONTH",
  "MONTHS",
  "WEEK",
  "WEEKS",
  "DAY",
  "DAYS",
  "HOUR",
  "HOURS",
  "MINUTE",
  "MINUTES",
  "SECOND",
  "SECONDS",
  "MICROSECOND",
  "MICROSECONDS",
  "MILLISECOND",
  "MILLISECONDS",
  "QUARTER",
  "QUARTERS",
]);
