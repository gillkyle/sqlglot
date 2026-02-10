import type { Expression } from "./expressions.js";
import { ErrorLevel, UnsupportedError, concatMessages } from "./errors.js";
import { csv } from "./helper.js";

// Lazy-loaded expressions module (set by index.ts to break circular dependency)
let exp: any;
export function _setExpModule(m: any): void {
  exp = m;
}

/**
 * Minimal SQL generator: converts an AST back into a SQL string.
 *
 * Dispatches to `<key>Sql` methods where `key` is the lowercase class name
 * of the expression node (e.g., `Select` -> `selectSql`). Falls back to
 * `functionFallbackSql` for Func subclasses and raises for unknown types.
 */
export class Generator {
  // ── options ───────────────────────────────────────────────────────────
  dialect: any;
  pretty: boolean;
  identify: boolean | string;
  normalize: boolean;
  normalizeFunction: string | boolean;
  unsupportedLevel: ErrorLevel;
  maxUnsupported: number;
  leadingComma: boolean;
  maxTextWidth: number;
  comments: boolean;
  pad: number;
  _indent: number;

  unsupportedMessages: string[] = [];

  // ── dialect-derived settings ──────────────────────────────────────────
  private _identifierStart: string;
  private _identifierEnd: string;
  private _escapedIdentifierEnd: string;
  private _quoteStart: string;
  private _quoteEnd: string;
  private _escapedQuoteEnd: string;

  constructor(opts: Record<string, any> = {}) {
    this.dialect = opts.dialect ?? null;
    this.pretty = opts.pretty ?? false;
    this.identify = opts.identify ?? false;
    this.normalize = opts.normalize ?? false;
    this.normalizeFunction = opts.normalize_functions ?? "upper";
    this.unsupportedLevel = opts.unsupported_level ?? ErrorLevel.WARN;
    this.maxUnsupported = opts.max_unsupported ?? 3;
    this.leadingComma = opts.leading_comma ?? false;
    this.maxTextWidth = opts.max_text_width ?? 80;
    this.comments = opts.comments ?? true;
    this.pad = opts.pad ?? 2;
    this._indent = opts.indent ?? 2;

    const d = this.dialect;
    this._quoteStart = d?.QUOTE_START ?? "'";
    this._quoteEnd = d?.QUOTE_END ?? "'";
    this._identifierStart = d?.IDENTIFIER_START ?? '"';
    this._identifierEnd = d?.IDENTIFIER_END ?? '"';
    this._escapedIdentifierEnd = this._identifierEnd + this._identifierEnd;
    this._escapedQuoteEnd = this._quoteEnd + this._quoteEnd;
  }

  // ── public API ────────────────────────────────────────────────────────

  generate(expression: Expression, copy: boolean = true): string {
    if (copy) {
      expression = expression.copy();
    }
    this.unsupportedMessages = [];
    const result = this.sql(expression).trim();

    if (this.unsupportedLevel === ErrorLevel.IGNORE) {
      return result;
    }
    if (this.unsupportedLevel === ErrorLevel.WARN) {
      for (const msg of this.unsupportedMessages) {
        console.warn(msg);
      }
    } else if (
      this.unsupportedLevel === ErrorLevel.RAISE &&
      this.unsupportedMessages.length > 0
    ) {
      throw new UnsupportedError(
        concatMessages(this.unsupportedMessages, this.maxUnsupported),
      );
    }
    return result;
  }

  unsupported(message: string): void {
    if (this.unsupportedLevel === ErrorLevel.IMMEDIATE) {
      throw new UnsupportedError(message);
    }
    this.unsupportedMessages.push(message);
  }

  // ── formatting helpers ────────────────────────────────────────────────

  sep(sep: string = " "): string {
    return this.pretty ? `${sep.trim()}\n` : sep;
  }

  seg(sqlStr: string, sep: string = " "): string {
    return `${this.sep(sep)}${sqlStr}`;
  }

  indent(
    sqlStr: string,
    level: number = 0,
    pad?: number,
    skipFirst: boolean = false,
    skipLast: boolean = false,
  ): string {
    if (!this.pretty || !sqlStr) return sqlStr;
    const padSize = pad ?? this.pad;
    const lines = sqlStr.split("\n");
    return lines
      .map((line, i) => {
        if ((skipFirst && i === 0) || (skipLast && i === lines.length - 1)) {
          return line;
        }
        return `${" ".repeat(level * this._indent + padSize)}${line}`;
      })
      .join("\n");
  }

  wrap(expression: Expression | string): string {
    const thisSql =
      typeof expression === "string"
        ? expression
        : this.sql(expression, "this");
    if (!thisSql) return "()";
    return `(${thisSql})`;
  }

  normalizeFunc(name: string): string {
    if (this.normalizeFunction === "upper" || this.normalizeFunction === true) {
      return name.toUpperCase();
    }
    if (this.normalizeFunction === "lower") {
      return name.toLowerCase();
    }
    return name;
  }

  // ── dispatch ──────────────────────────────────────────────────────────

  sql(
    expression: string | Expression | null | undefined,
    key?: string,
  ): string {
    if (!expression) return "";
    if (typeof expression === "string") return expression;

    if (key) {
      const value = expression.args[key];
      if (value) return this.sql(value);
      return "";
    }

    const expKey = (expression.constructor as any).key as string;
    const handlerName = `${expKey}Sql`;

    if (typeof (this as any)[handlerName] === "function") {
      return (this as any)[handlerName](expression);
    }

    // Func fallback: use function_fallback_sql
    if (exp && expression instanceof exp.Func) {
      return this.functionFallbackSql(expression);
    }

    throw new Error(
      `Unsupported expression type ${expression.constructor.name}`,
    );
  }

  // ── SELECT ────────────────────────────────────────────────────────────

  selectSql(expression: Expression): string {
    const distinct = this.sql(expression, "distinct");
    const distinctSql = distinct ? ` ${distinct}` : "";

    const expressionsSql = this.expressions(expression);
    const exprPart = expressionsSql
      ? `${this.sep()}${expressionsSql}`
      : expressionsSql;

    const fromSql = this.sql(expression, "from_");
    const sql = this.queryModifiers(
      expression,
      `SELECT${distinctSql}${exprPart}`,
      fromSql,
    );

    return this.prependCtes(expression, sql);
  }

  // ── CTE / WITH ────────────────────────────────────────────────────────

  prependCtes(expression: Expression, sqlStr: string): string {
    const withSql = this.sql(expression, "with_");
    if (withSql) {
      return `${withSql}${this.sep()}${sqlStr}`;
    }
    return sqlStr;
  }

  withSql(expression: Expression): string {
    const sqlStr = this.expressions(expression, { flat: true });
    const recursive = expression.args.recursive ? "RECURSIVE " : "";
    return `WITH ${recursive}${sqlStr}`;
  }

  cteSql(expression: Expression): string {
    const aliasSql = this.sql(expression, "alias");
    const thisSql = this.wrap(expression);
    return `${aliasSql} AS ${thisSql}`;
  }

  // ── FROM ──────────────────────────────────────────────────────────────

  fromSql(expression: Expression): string {
    return `${this.seg("FROM")} ${this.sql(expression, "this")}`;
  }

  // ── TABLE ─────────────────────────────────────────────────────────────

  tableParts(expression: Expression): string {
    return [
      expression.args.catalog,
      expression.args.db,
      expression.args.this,
    ]
      .filter((p) => p != null)
      .map((p) => this.sql(p))
      .join(".");
  }

  tableSql(expression: Expression): string {
    const table = this.tableParts(expression);
    const alias = this.sql(expression, "alias");
    const aliasSql = alias ? ` AS ${alias}` : "";
    return `${table}${aliasSql}`;
  }

  // ── TABLE ALIAS ───────────────────────────────────────────────────────

  tablealiasSql(expression: Expression): string {
    const alias = this.sql(expression, "this");
    const columns = this.expressions(expression, { key: "columns", flat: true });
    const columnsSql = columns ? `(${columns})` : "";
    return `${alias}${columnsSql}`;
  }

  // ── COLUMN ────────────────────────────────────────────────────────────

  columnParts(expression: Expression): string {
    return [
      expression.args.catalog,
      expression.args.db,
      expression.args.table,
      expression.args.this,
    ]
      .filter((p) => p != null)
      .map((p) => this.sql(p))
      .join(".");
  }

  columnSql(expression: Expression): string {
    return this.columnParts(expression);
  }

  // ── IDENTIFIER ────────────────────────────────────────────────────────

  identifierSql(expression: Expression): string {
    let text = expression.name;
    const lower = text.toLowerCase();
    text = this.normalize && !expression.args.quoted ? lower : text;
    text = text.replace(this._identifierEnd, this._escapedIdentifierEnd);
    if (expression.args.quoted || this.identify === true) {
      text = `${this._identifierStart}${text}${this._identifierEnd}`;
    }
    return text;
  }

  // ── LITERAL ───────────────────────────────────────────────────────────

  literalSql(expression: Expression): string {
    const text = expression.this_ ?? "";
    if (expression.isString) {
      const escaped = String(text).replace(
        new RegExp(this._quoteEnd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
        this._escapedQuoteEnd,
      );
      return `${this._quoteStart}${escaped}${this._quoteEnd}`;
    }
    return String(text);
  }

  // ── STAR ──────────────────────────────────────────────────────────────

  starSql(_expression: Expression): string {
    return "*";
  }

  // ── NULL ──────────────────────────────────────────────────────────────

  nullSql(_expression: Expression): string {
    return "NULL";
  }

  // ── BOOLEAN ───────────────────────────────────────────────────────────

  booleanSql(expression: Expression): string {
    return expression.this_ ? "TRUE" : "FALSE";
  }

  // ── ALIAS ─────────────────────────────────────────────────────────────

  aliasSql(expression: Expression): string {
    const alias = this.sql(expression, "alias");
    const aliasSql = alias ? ` AS ${alias}` : "";
    return `${this.sql(expression, "this")}${aliasSql}`;
  }

  // ── PAREN ─────────────────────────────────────────────────────────────

  parenSql(expression: Expression): string {
    return `(${this.sql(expression, "this")})`;
  }

  // ── TUPLE ─────────────────────────────────────────────────────────────

  tupleSql(expression: Expression): string {
    return `(${this.expressions(expression, { flat: true })})`;
  }

  // ── SUBQUERY ──────────────────────────────────────────────────────────

  subquerySql(expression: Expression): string {
    const alias = this.sql(expression, "alias");
    const aliasSql = alias ? ` AS ${alias}` : "";
    const thisSql = this.wrap(expression);
    return `${thisSql}${aliasSql}`;
  }

  // ── BINARY OPERATORS ──────────────────────────────────────────────────

  binary(expression: Expression, op: string): string {
    const sqls: string[] = [];
    const stack: Array<string | Expression> = [expression];
    const binaryType = expression.constructor;

    while (stack.length > 0) {
      const node = stack.pop()!;
      if ((node as any).constructor === binaryType) {
        const e = node as Expression;
        stack.push(e.args.expression);
        stack.push(` ${op} `);
        stack.push(e.this_);
      } else {
        sqls.push(this.sql(node as any));
      }
    }
    return sqls.join("");
  }

  addSql(expression: Expression): string {
    return this.binary(expression, "+");
  }

  subSql(expression: Expression): string {
    return this.binary(expression, "-");
  }

  mulSql(expression: Expression): string {
    return this.binary(expression, "*");
  }

  divSql(expression: Expression): string {
    return this.binary(expression, "/");
  }

  modSql(expression: Expression): string {
    return this.binary(expression, "%");
  }

  eqSql(expression: Expression): string {
    return this.binary(expression, "=");
  }

  neqSql(expression: Expression): string {
    return this.binary(expression, "<>");
  }

  gtSql(expression: Expression): string {
    return this.binary(expression, ">");
  }

  gteSql(expression: Expression): string {
    return this.binary(expression, ">=");
  }

  ltSql(expression: Expression): string {
    return this.binary(expression, "<");
  }

  lteSql(expression: Expression): string {
    return this.binary(expression, "<=");
  }

  isSql(expression: Expression): string {
    const not = expression.args["not"] ? " NOT" : "";
    return this.binary(expression, `IS${not}`);
  }

  likeSql(expression: Expression): string {
    return this.binary(expression, "LIKE");
  }

  ilikeSql(expression: Expression): string {
    return this.binary(expression, "ILIKE");
  }

  dotSql(expression: Expression): string {
    return `${this.sql(expression, "this")}.${this.sql(expression, "expression")}`;
  }

  // ── AND / OR (connector) ──────────────────────────────────────────────

  connectorSql(expression: Expression, op: string): string {
    const sqls: string[] = [];
    const stack: Array<string | Expression> = [expression];
    const ops = new Set<string>();

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (exp && node instanceof exp.Connector) {
        const e = node as Expression;
        const key = (e.constructor as any).key;
        const handler = `${key}Sql`;
        if (typeof (this as any)[handler] === "function") {
          ops.add((this as any)[handler](e, stack));
        }
      } else {
        const sqlStr = this.sql(node as any);
        if (sqls.length > 0 && ops.has(sqls[sqls.length - 1]!)) {
          sqls[sqls.length - 1] += ` ${sqlStr}`;
        } else {
          sqls.push(sqlStr);
        }
      }
    }

    return sqls.join(" ");
  }

  andSql(
    expression: Expression,
    stack?: Array<string | Expression>,
  ): string {
    if (stack) {
      stack.push(expression.args.expression);
      stack.push("AND");
      stack.push(expression.this_);
      return "AND";
    }
    return this.connectorSql(expression, "AND");
  }

  orSql(
    expression: Expression,
    stack?: Array<string | Expression>,
  ): string {
    if (stack) {
      stack.push(expression.args.expression);
      stack.push("OR");
      stack.push(expression.this_);
      return "OR";
    }
    return this.connectorSql(expression, "OR");
  }

  // ── NOT ───────────────────────────────────────────────────────────────

  notSql(expression: Expression): string {
    return `NOT ${this.sql(expression, "this")}`;
  }

  // ── NEG ───────────────────────────────────────────────────────────────

  negSql(expression: Expression): string {
    const thisSql = this.sql(expression, "this");
    const sep = thisSql[0] === "-" ? " " : "";
    return `-${sep}${thisSql}`;
  }

  // ── EXISTS ────────────────────────────────────────────────────────────

  existsSql(expression: Expression): string {
    return `EXISTS${this.wrap(expression)}`;
  }

  // ── IN ────────────────────────────────────────────────────────────────

  inSql(expression: Expression): string {
    const query = expression.args.query;
    const field = expression.args.field;

    let inSql: string;
    if (query) {
      inSql = this.sql(query);
    } else if (field) {
      inSql = this.sql(field);
    } else {
      inSql = `(${this.expressions(expression, { flat: true })})`;
    }

    return `${this.sql(expression, "this")} IN ${inSql}`;
  }

  // ── BETWEEN ───────────────────────────────────────────────────────────

  betweenSql(expression: Expression): string {
    const thisSql = this.sql(expression, "this");
    const low = this.sql(expression, "low");
    const high = this.sql(expression, "high");
    return `${thisSql} BETWEEN ${low} AND ${high}`;
  }

  // ── CAST ──────────────────────────────────────────────────────────────

  castSql(expression: Expression): string {
    const thisSql = this.sql(expression, "this");
    const to = this.sql(expression, "to");
    return `CAST(${thisSql} AS ${to})`;
  }

  trycastSql(expression: Expression): string {
    const thisSql = this.sql(expression, "this");
    const to = this.sql(expression, "to");
    return `TRY_CAST(${thisSql} AS ${to})`;
  }

  // ── DATA TYPE ─────────────────────────────────────────────────────────

  datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }

  // ── CASE / WHEN ───────────────────────────────────────────────────────

  caseSql(expression: Expression): string {
    const thisSql = this.sql(expression, "this");
    const statements: string[] = [thisSql ? `CASE ${thisSql}` : "CASE"];

    for (const e of expression.args.ifs || []) {
      statements.push(`WHEN ${this.sql(e, "this")}`);
      statements.push(`THEN ${this.sql(e, "true")}`);
    }

    const defaultSql = this.sql(expression, "default");
    if (defaultSql) {
      statements.push(`ELSE ${defaultSql}`);
    }
    statements.push("END");

    return statements.join(" ");
  }

  ifSql(expression: Expression): string {
    return this.caseSql(
      new (exp.Case)({
        ifs: [expression],
        default: expression.args.false,
      }),
    );
  }

  // ── EXTRACT ───────────────────────────────────────────────────────────

  extractSql(expression: Expression): string {
    const thisSql = this.sql(expression, "this");
    const exprSql = this.sql(expression, "expression");
    return `EXTRACT(${thisSql} FROM ${exprSql})`;
  }

  // ── INTERVAL ──────────────────────────────────────────────────────────

  intervalSql(expression: Expression): string {
    const thisSql = this.sql(expression, "this");
    const unit = this.sql(expression, "unit");
    const unitPart = unit ? ` ${unit}` : "";
    const thisPart = thisSql ? ` ${thisSql}` : "";
    return `INTERVAL${thisPart}${unitPart}`;
  }

  // ── VAR ───────────────────────────────────────────────────────────────

  varSql(expression: Expression): string {
    return this.sql(expression, "this");
  }

  // ── DISTINCT ──────────────────────────────────────────────────────────

  distinctSql(expression: Expression): string {
    const thisSql = this.expressions(expression, { flat: true });
    if (thisSql) {
      return `DISTINCT ${thisSql}`;
    }
    return "DISTINCT";
  }

  // ── COUNT ───────────────────────────────────────────────────────────

  countSql(expression: Expression): string {
    const thisExpr = expression.this_;
    const isDistinct =
      thisExpr && (thisExpr.constructor as any).key === "distinct";
    const args = expression.expressions ?? [];
    if (isDistinct && args.length > 0) {
      const argsSql = args.map((a: any) => this.sql(a)).join(", ");
      return `COUNT(DISTINCT ${argsSql})`;
    }
    const thisSql = this.sql(expression, "this");
    return `COUNT(${thisSql})`;
  }

  // ── DATE/TIME FUNCTIONS ─────────────────────────────────────────────

  currentdateSql(expression: Expression): string {
    const zone = this.sql(expression, "this");
    if (zone) return `CURRENT_DATE AT TIME ZONE ${zone}`;
    return "CURRENT_DATE";
  }

  currenttimeSql(expression: Expression): string {
    const zone = this.sql(expression, "this");
    if (zone) return `CURRENT_TIME AT TIME ZONE ${zone}`;
    return "CURRENT_TIME";
  }

  currenttimestampSql(expression: Expression): string {
    const zone = this.sql(expression, "this");
    if (zone) return `CURRENT_TIMESTAMP AT TIME ZONE ${zone}`;
    return "CURRENT_TIMESTAMP";
  }

  currentdatetimeSql(expression: Expression): string {
    const zone = this.sql(expression, "this");
    if (zone) return `CURRENT_DATETIME AT TIME ZONE ${zone}`;
    return "CURRENT_DATETIME";
  }

  // ── WINDOW ────────────────────────────────────────────────────────────

  windowSql(expression: Expression): string {
    const thisSql = this.sql(expression, "this");
    const partitionBy = this.expressions(expression, {
      key: "partition_by",
      flat: true,
    });
    const partitionSql = partitionBy ? `PARTITION BY ${partitionBy}` : "";

    const order = expression.args.order;
    const orderSql = order ? this.orderSql(order, true) : "";

    const alias = this.sql(expression, "alias");

    if (!partitionSql && !orderSql && alias) {
      return `${thisSql} OVER ${alias}`;
    }

    const parts = [alias, partitionSql, orderSql]
      .filter(Boolean)
      .join(" ");
    return `${thisSql} OVER (${parts})`;
  }

  // ── JOIN ──────────────────────────────────────────────────────────────

  joinSql(expression: Expression): string {
    const method = expression.text("method").toUpperCase();
    const side = expression.text("side").toUpperCase();
    const kind = expression.text("kind").toUpperCase();

    const opParts = [method, side, kind].filter(Boolean);
    let opSql = opParts.join(" ");

    const thisSql = this.sql(expression, "this");
    const on = this.sql(expression, "on");
    const using = expression.args.using as Expression[] | undefined;

    let onSql: string;
    if (on) {
      onSql = ` ON ${on}`;
    } else if (using && using.length > 0) {
      const usingCols = using.map((c: any) => this.sql(c)).join(", ");
      onSql = ` USING (${usingCols})`;
    } else {
      onSql = "";
    }

    if (!opSql && !onSql) {
      return `, ${thisSql}`;
    }

    opSql = opSql ? `${opSql} JOIN` : "JOIN";
    return `${this.seg(opSql)} ${thisSql}${onSql}`;
  }

  // ── WHERE ─────────────────────────────────────────────────────────────

  whereSql(expression: Expression): string {
    const thisSql = this.sql(expression, "this");
    return `${this.seg("WHERE")}${this.sep()}${thisSql}`;
  }

  // ── GROUP BY ──────────────────────────────────────────────────────────

  groupSql(expression: Expression): string {
    return this.opExpressions("GROUP BY", expression);
  }

  // ── HAVING ────────────────────────────────────────────────────────────

  havingSql(expression: Expression): string {
    const thisSql = this.sql(expression, "this");
    return `${this.seg("HAVING")}${this.sep()}${thisSql}`;
  }

  // ── ORDER BY ──────────────────────────────────────────────────────────

  orderSql(expression: Expression, flat: boolean = false): string {
    const thisSql = this.sql(expression, "this");
    const thisPrefix = thisSql ? `${thisSql} ` : "";
    return this.opExpressions(`${thisPrefix}ORDER BY`, expression, flat);
  }

  orderedSql(expression: Expression): string {
    const thisSql = this.sql(expression, "this");
    const desc = expression.args.desc;
    const sortOrder = desc ? " DESC" : desc === false ? " ASC" : "";

    const nullsFirst = expression.args.nulls_first;
    let nullsSql = "";
    if (nullsFirst === true) {
      nullsSql = " NULLS FIRST";
    } else if (nullsFirst === false) {
      nullsSql = " NULLS LAST";
    }

    return `${thisSql}${sortOrder}${nullsSql}`;
  }

  // ── LIMIT ─────────────────────────────────────────────────────────────

  limitSql(expression: Expression): string {
    const thisSql = this.sql(expression, "this");
    const exprSql = this.sql(expression, "expression");
    return `${thisSql}${this.seg("LIMIT")} ${exprSql}`;
  }

  // ── OFFSET ────────────────────────────────────────────────────────────

  offsetSql(expression: Expression): string {
    const thisSql = this.sql(expression, "this");
    const exprSql = this.sql(expression, "expression");
    return `${thisSql}${this.seg("OFFSET")} ${exprSql}`;
  }

  // ── SET OPERATIONS (UNION, INTERSECT, EXCEPT) ─────────────────────────

  setOperations(expression: Expression): string {
    const sqls: string[] = [];
    const stack: Array<string | Expression> = [expression];

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (exp && node instanceof exp.SetOperation) {
        const e = node as Expression;
        stack.push(e.args.expression);
        stack.push(this.setOperation(e));
        stack.push(e.this_);
      } else {
        sqls.push(this.sql(node as any));
      }
    }

    const thisSql = sqls.join(this.sep());
    const withMods = this.queryModifiers(expression, thisSql);
    return this.prependCtes(expression, withMods);
  }

  setOperation(expression: Expression): string {
    const opName = (expression.constructor as any).key.toUpperCase();
    const distinct = expression.args.distinct;
    let distinctOrAll = "";

    if (distinct === true) {
      distinctOrAll = "";
    } else if (distinct === false) {
      distinctOrAll = " ALL";
    }

    return `${opName}${distinctOrAll}`;
  }

  unionSql(expression: Expression): string {
    return this.setOperations(expression);
  }

  intersectSql(expression: Expression): string {
    return this.setOperations(expression);
  }

  exceptSql(expression: Expression): string {
    return this.setOperations(expression);
  }

  // ── QUERY MODIFIERS ───────────────────────────────────────────────────

  queryModifiers(expression: Expression, ...sqls: string[]): string {
    const joinsSql = (expression.args.joins || [])
      .map((j: any) => this.sql(j))
      .join("");

    return [
      ...sqls,
      joinsSql,
      this.sql(expression, "where"),
      this.sql(expression, "group"),
      this.sql(expression, "having"),
      this.sql(expression, "order"),
      ...this.offsetLimitModifiers(expression),
    ]
      .filter(Boolean)
      .join("");
  }

  offsetLimitModifiers(expression: Expression): string[] {
    return [
      this.sql(expression, "limit"),
      this.sql(expression, "offset"),
    ];
  }

  // ── FUNCTION HELPERS ──────────────────────────────────────────────────

  func(
    name: string,
    ...args: Array<Expression | string | null | undefined>
  ): string {
    const normalizedName = this.normalizeFunc(name);
    const argsSql = args
      .filter((a) => a !== null && a !== undefined)
      .map((a) => this.sql(a as any))
      .join(", ");
    return `${normalizedName}(${argsSql})`;
  }

  functionFallbackSql(expression: Expression): string {
    const args: any[] = [];
    const argTypes = (expression.constructor as any).argTypes || {};

    for (const key of Object.keys(argTypes)) {
      const argValue = expression.args[key];
      if (Array.isArray(argValue)) {
        for (const value of argValue) {
          args.push(value);
        }
      } else if (argValue !== null && argValue !== undefined) {
        args.push(argValue);
      }
    }

    const name = this.sqlName(expression);
    return this.func(name, ...args);
  }

  private sqlName(expression: Expression): string {
    const ctor = expression.constructor as any;
    if (ctor.sqlNames) {
      const names = ctor.sqlNames();
      if (names && names.length > 0) return names[0];
    }
    // Convert class name from PascalCase to UPPER_SNAKE_CASE
    return ctor.name
      .replace(/([A-Z])/g, "_$1")
      .toUpperCase()
      .replace(/^_/, "");
  }

  // ── ANONYMOUS FUNCTION ────────────────────────────────────────────────

  anonymousSql(expression: Expression): string {
    return this.func(
      this.sql(expression, "this"),
      ...(expression.expressions || []),
    );
  }

  // ── EXPRESSIONS HELPER ────────────────────────────────────────────────

  expressions(
    expression: Expression,
    opts?: {
      key?: string;
      flat?: boolean;
      sep?: string;
      indent?: boolean;
    },
  ): string {
    const key = opts?.key ?? "expressions";
    const flat = opts?.flat ?? false;
    const sep = opts?.sep ?? ", ";

    const exprs = expression.args[key];
    if (!exprs || (Array.isArray(exprs) && exprs.length === 0)) {
      return "";
    }

    if (flat) {
      return (exprs as any[])
        .map((e: any) => this.sql(e))
        .filter(Boolean)
        .join(sep);
    }

    const result = (exprs as any[])
      .map((e: any, i: number) => {
        const s = this.sql(e);
        if (!s) return "";
        return i < exprs.length - 1 ? `${s}${sep}` : s;
      })
      .filter(Boolean);

    return result.join("");
  }

  opExpressions(
    op: string,
    expression: Expression,
    flat: boolean = false,
  ): string {
    const expressionsSql = this.expressions(expression, { flat });
    if (flat) {
      return `${op} ${expressionsSql}`;
    }
    return `${this.seg(op)}${expressionsSql ? `${this.sep()}${expressionsSql}` : ""}`;
  }
}
