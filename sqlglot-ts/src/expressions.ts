/**
 * Expressions module - the heart of the SQLGlot TypeScript port.
 *
 * Every AST node is represented by a subclass of Expression.
 * This module defines all supported Expression types plus helper functions
 * for programmatically building SQL expressions.
 */

import type { ErrorLevel } from "./errors.js";
import type { TokenType } from "./tokens.js";

// ---------------------------------------------------------------------------
// Dialect module injection (avoids circular imports in ESM)
// ---------------------------------------------------------------------------
let _dialectModule: any = null;

export function _setDialectModule(mod: any): void {
  _dialectModule = mod;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ExpOrStr = Expression | string;

export type IntoType =
  | string
  | (new (...args: any[]) => Expression)
  | Array<string | (new (...args: any[]) => Expression)>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const SQLGLOT_META = "sqlglot.meta";
export const SQLGLOT_ANONYMOUS = "sqlglot.anonymous";
export const TABLE_PARTS = ["this", "db", "catalog"] as const;
export const COLUMN_PARTS = ["this", "table", "db", "catalog"] as const;
export const POSITION_META_KEYS = ["line", "col", "start", "end"] as const;

export const QUERY_MODIFIERS: Record<string, boolean> = {
  match: false,
  laterals: false,
  joins: false,
  connect: false,
  pivots: false,
  prewhere: false,
  where: false,
  group: false,
  having: false,
  qualify: false,
  windows: false,
  distribute: false,
  sort: false,
  cluster: false,
  order: false,
  limit: false,
  offset: false,
  locks: false,
  sample: false,
  settings: false,
  format: false,
  options: false,
};

// ---------------------------------------------------------------------------
// Helpers (internal)
// ---------------------------------------------------------------------------

function _isExpression(v: any): v is Expression {
  return v instanceof Expression;
}

function _maybeCopy<T extends Expression>(instance: T | null | undefined, copy: boolean): T {
  if (!instance) return instance as unknown as T;
  return copy ? (instance.copy() as T) : instance;
}

function _wrap<E extends Expression>(
  expression: E | null | undefined,
  kind: new (...args: any[]) => Expression,
): E | Paren | null | undefined {
  if (expression instanceof kind) {
    return new Paren({ this: expression }) as any;
  }
  return expression;
}

const SAFE_IDENTIFIER_RE = /^[_a-zA-Z]\w*$/;

// Simple hash utilities (FNV-1a style for strings, combine for tuples)
function _simpleHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) | 0;
  }
  return h;
}

function _combineHash(current: number, ...parts: any[]): number {
  let h = current;
  for (const p of parts) {
    if (p === undefined || p === null) {
      h = (h * 31) | 0;
    } else if (typeof p === "number") {
      h = (h * 31 + p) | 0;
    } else if (typeof p === "string") {
      h = (h * 31 + _simpleHash(p)) | 0;
    } else if (_isExpression(p)) {
      h = (h * 31 + p.hashCode()) | 0;
    } else if (typeof p === "boolean") {
      h = (h * 31 + (p ? 1 : 0)) | 0;
    } else {
      h = (h * 31 + _simpleHash(String(p))) | 0;
    }
  }
  return h;
}

// ---------------------------------------------------------------------------
// Expression base class
// ---------------------------------------------------------------------------

/**
 * The base class for all expressions in a syntax tree.
 */
export class Expression {
  static argTypes: Record<string, boolean> = { this: true };
  static key: string = "expression";

  args: Record<string, any>;
  parent?: Expression;
  argKey?: string;
  index?: number;
  comments?: string[];
  _type?: DataType;
  _meta?: Record<string, any>;
  _hash?: number;

  constructor(args: Record<string, any> = {}) {
    this.args = args;
    this.parent = undefined;
    this.argKey = undefined;
    this.index = undefined;
    this.comments = undefined;
    this._type = undefined;
    this._meta = undefined;
    this._hash = undefined;

    for (const [argKey, value] of Object.entries(this.args)) {
      this._setParent(argKey, value);
    }
  }

  // -- Property accessors ---------------------------------------------------

  get this_(): any {
    return this.args["this"];
  }

  get expression(): any {
    return this.args["expression"];
  }

  get expressions(): any[] {
    return this.args["expressions"] || [];
  }

  text(key: string): string {
    const field = this.args[key];
    if (typeof field === "string") return field;
    if (field instanceof Identifier || field instanceof Literal) {
      return field.this_;
    }
    if (field instanceof Star) return field.name;
    if (field instanceof Null) return field.name;
    return "";
  }

  get name(): string {
    return this.text("this");
  }

  get alias(): string {
    const a = this.args["alias"];
    if (a instanceof TableAlias) {
      return a.name;
    }
    return this.text("alias");
  }

  get aliasOrName(): string {
    return this.alias || this.name;
  }

  get outputName(): string {
    return "";
  }

  get type(): DataType | undefined {
    if (this instanceof Cast) {
      return this._type || this.to;
    }
    return this._type;
  }

  set type(dtype: DataType | string | undefined) {
    if (dtype && !(dtype instanceof DataType)) {
      dtype = DataType.build(dtype);
    }
    this._type = dtype as DataType | undefined;
  }

  get isString(): boolean {
    return this instanceof Literal && !!this.args["is_string"];
  }

  get isNumber(): boolean {
    return (
      (this instanceof Literal && !this.args["is_string"]) ||
      (this instanceof Neg && (this.this_ as Expression)?.isNumber)
    );
  }

  get isStar(): boolean {
    return (
      this instanceof Star ||
      (this instanceof Column && this.this_ instanceof Star)
    );
  }

  isType(...dtypes: any[]): boolean {
    return this.type !== undefined && this.type.isType(...dtypes);
  }

  isLeaf(): boolean {
    for (const v of Object.values(this.args)) {
      if (_isExpression(v) && v) return false;
      if (Array.isArray(v) && v.length > 0) return false;
    }
    return true;
  }

  get meta(): Record<string, any> {
    if (!this._meta) {
      this._meta = {};
    }
    return this._meta;
  }

  // -- Tree mutation --------------------------------------------------------

  _setParent(argKey: string, value: any, index?: number): void {
    if (_isExpression(value)) {
      value.parent = this;
      value.argKey = argKey;
      value.index = index;
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const v = value[i];
        if (_isExpression(v)) {
          v.parent = this;
          v.argKey = argKey;
          v.index = i;
        }
      }
    }
  }

  set(argKey: string, value: any, index?: number, overwrite: boolean = true): void {
    // Invalidate hash chain
    let expr: Expression | undefined = this;
    while (expr && expr._hash !== undefined) {
      expr._hash = undefined;
      expr = expr.parent;
    }

    if (index !== undefined) {
      const expressions: any[] = this.args[argKey] || [];
      if (index >= expressions.length || index < 0) return;
      if (value === null || value === undefined) {
        expressions.splice(index, 1);
        for (let i = index; i < expressions.length; i++) {
          if (_isExpression(expressions[i])) {
            expressions[i].index = i;
          }
        }
        return;
      }
      if (Array.isArray(value)) {
        expressions.splice(index, 1, ...value);
      } else if (overwrite) {
        expressions[index] = value;
      } else {
        expressions.splice(index, 0, value);
      }
      value = expressions;
    } else if (value === null || value === undefined) {
      delete this.args[argKey];
      return;
    }

    this.args[argKey] = value;
    this._setParent(argKey, value, index);
  }

  append(argKey: string, value: any): void {
    if (!Array.isArray(this.args[argKey])) {
      this.args[argKey] = [];
    }
    this._setParent(argKey, value);
    const values = this.args[argKey] as any[];
    if (_isExpression(value)) {
      value.index = values.length;
    }
    values.push(value);
  }

  // -- Traversal ------------------------------------------------------------

  get depth(): number {
    if (this.parent) {
      return this.parent.depth + 1;
    }
    return 0;
  }

  *iterExpressions(reverse: boolean = false): IterableIterator<Expression> {
    const values = Object.values(this.args);
    const iter = reverse ? [...values].reverse() : values;
    for (const vs of iter) {
      if (Array.isArray(vs)) {
        const arr = reverse ? [...vs].reverse() : vs;
        for (const v of arr) {
          if (_isExpression(v)) yield v;
        }
      } else if (_isExpression(vs)) {
        yield vs;
      }
    }
  }

  *walk(
    bfs: boolean = true,
    prune?: (node: Expression) => boolean,
  ): IterableIterator<Expression> {
    if (bfs) {
      yield* this.bfs_(prune);
    } else {
      yield* this.dfs_(prune);
    }
  }

  *dfs_(prune?: (node: Expression) => boolean): IterableIterator<Expression> {
    const stack: Expression[] = [this];
    while (stack.length > 0) {
      const node = stack.pop()!;
      yield node;
      if (prune && prune(node)) continue;
      for (const v of node.iterExpressions(true)) {
        stack.push(v);
      }
    }
  }

  *bfs_(prune?: (node: Expression) => boolean): IterableIterator<Expression> {
    const queue: Expression[] = [this];
    let head = 0;
    while (head < queue.length) {
      const node = queue[head++]!;
      yield node;
      if (prune && prune(node)) continue;
      for (const v of node.iterExpressions()) {
        queue.push(v);
      }
    }
  }

  find<T extends Expression>(
    ...expressionTypes: Array<new (...args: any[]) => T>
  ): T | undefined {
    for (const expr of this.findAll(...expressionTypes)) {
      return expr;
    }
    return undefined;
  }

  *findAll<T extends Expression>(
    ...expressionTypes: Array<new (...args: any[]) => T>
  ): IterableIterator<T> {
    for (const expr of this.walk(true)) {
      for (const et of expressionTypes) {
        if (expr instanceof et) {
          yield expr as T;
          break;
        }
      }
    }
  }

  findAncestor<T extends Expression>(
    ...expressionTypes: Array<new (...args: any[]) => T>
  ): T | undefined {
    let ancestor = this.parent;
    while (ancestor) {
      for (const et of expressionTypes) {
        if (ancestor instanceof et) return ancestor as T;
      }
      ancestor = ancestor.parent;
    }
    return undefined;
  }

  root(): Expression {
    let expression: Expression = this;
    while (expression.parent) {
      expression = expression.parent;
    }
    return expression;
  }

  // -- Transform / Copy -----------------------------------------------------

  transform(
    fn: (node: Expression, ...args: any[]) => Expression | null | undefined,
    opts?: { copy?: boolean },
  ): Expression {
    const copy = opts?.copy !== false;
    let root: Expression | null = null;
    let newNode: Expression | null | undefined = null;

    const tree = copy ? this.copy() : this;
    for (const node of tree.dfs_((n) => n !== newNode)) {
      const parent = node.parent;
      const nodeArgKey = node.argKey;
      const nodeIndex = node.index;
      newNode = fn(node);

      if (!root) {
        root = newNode ?? null;
      } else if (parent && nodeArgKey && newNode !== node) {
        parent.set(nodeArgKey, newNode ?? null, nodeIndex);
      }
    }
    return root!;
  }

  copy(): this {
    const Constructor = this.constructor as new (args: Record<string, any>) => this;
    const root = new Constructor({});
    const stack: Array<[Expression, Expression]> = [[this, root]];

    while (stack.length > 0) {
      const pair = stack.pop()!;
      const node = pair[0];
      const copyNode = pair[1];

      if (node.comments !== undefined) {
        copyNode.comments = [...(node.comments || [])];
      }
      if (node._type !== undefined) {
        copyNode._type = node._type;
      }
      if (node._meta !== undefined) {
        copyNode._meta = { ...node._meta };
      }
      if (node._hash !== undefined) {
        copyNode._hash = node._hash;
      }

      for (const [k, vs] of Object.entries(node.args)) {
        if (_isExpression(vs)) {
          const C = vs.constructor as new (args: Record<string, any>) => Expression;
          const childCopy = new C({});
          stack.push([vs, childCopy]);
          copyNode.set(k, childCopy);
        } else if (Array.isArray(vs)) {
          copyNode.args[k] = [];
          for (const v of vs) {
            if (_isExpression(v)) {
              const C = v.constructor as new (args: Record<string, any>) => Expression;
              const childCopy = new C({});
              stack.push([v, childCopy]);
              copyNode.append(k, childCopy);
            } else {
              copyNode.append(k, v);
            }
          }
        } else {
          copyNode.args[k] = vs;
        }
      }
    }
    return root;
  }

  replace(expression: Expression | null | undefined): Expression | null | undefined {
    const parent = this.parent;
    if (!parent || parent === expression) return expression;

    const key = this.argKey;
    if (!key) return expression;
    const value = parent.args[key];

    if (Array.isArray(expression) && _isExpression(value)) {
      value.parent?.replace(expression as any);
    } else {
      parent.set(key, expression ?? null, this.index);
    }

    if (expression !== this) {
      this.parent = undefined;
      this.argKey = undefined;
      this.index = undefined;
    }

    return expression;
  }

  pop(): this {
    this.replace(null);
    return this;
  }

  replaceChildren(fn: (node: Expression) => Expression | Expression[]): void {
    for (const [k, v] of Object.entries(this.args)) {
      const isListArg = Array.isArray(v);
      const childNodes: any[] = isListArg ? v : [v];
      const newChildNodes: any[] = [];

      for (const cn of childNodes) {
        if (_isExpression(cn)) {
          const result = fn(cn);
          if (Array.isArray(result)) {
            newChildNodes.push(...result);
          } else {
            newChildNodes.push(result);
          }
        } else {
          newChildNodes.push(cn);
        }
      }

      this.set(k, isListArg ? newChildNodes : (newChildNodes[0] ?? null));
    }
  }

  unnest(): Expression {
    let expression: Expression = this;
    while (expression instanceof Paren) {
      expression = expression.this_;
    }
    return expression;
  }

  unalias(): Expression {
    if (this instanceof Alias) {
      return this.this_;
    }
    return this;
  }

  *flatten(doUnnest: boolean = true): IterableIterator<Expression> {
    for (const node of this.dfs_(
      (n) => !!n.parent && n.constructor !== this.constructor,
    )) {
      if (node.constructor !== this.constructor) {
        yield doUnnest && !(node instanceof Subquery) ? node.unnest() : node;
      }
    }
  }

  // -- Equality / Hashing ---------------------------------------------------

  eq(other: Expression): boolean {
    if (this === other) return true;
    return this.constructor === other.constructor && this.hashCode() === other.hashCode();
  }

  hashCode(): number {
    if (this._hash !== undefined) return this._hash;

    const nodes: Expression[] = [];
    const queue: Expression[] = [this];
    let head = 0;

    while (head < queue.length) {
      const node = queue[head++]!;
      nodes.push(node);
      for (const v of node.iterExpressions()) {
        if (v._hash === undefined) {
          queue.push(v);
        }
      }
    }

    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]!;
      let h = _simpleHash((node.constructor as typeof Expression).key);
      const ctor = node.constructor;

      if (ctor === Literal || ctor === Identifier) {
        const sorted = Object.entries(node.args).sort(([a], [b]) => a.localeCompare(b));
        for (const [k, v] of sorted) {
          if (v) {
            h = _combineHash(h, k, v);
          }
        }
      } else {
        const sorted = Object.entries(node.args).sort(([a], [b]) => a.localeCompare(b));
        for (const [k, v] of sorted) {
          if (Array.isArray(v)) {
            for (const x of v) {
              if (x !== null && x !== undefined && x !== false) {
                const val = typeof x === "string" ? x.toLowerCase() : x;
                h = _combineHash(h, k, val);
              } else {
                h = _combineHash(h, k, undefined);
              }
            }
          } else if (v !== null && v !== undefined && v !== false) {
            const val = typeof v === "string" ? v.toLowerCase() : v;
            h = _combineHash(h, k, val);
          }
        }
      }

      node._hash = h;
    }

    return this._hash!;
  }

  // -- SQL generation -------------------------------------------------------

  sql(opts?: { dialect?: string; pretty?: boolean; [key: string]: any }): string {
    if (!_dialectModule) {
      throw new Error(
        "Dialect module not initialized. Call _setDialectModule() first.",
      );
    }
    return _dialectModule.Dialect.getOrRaise(opts?.dialect).generate(this, opts);
  }

  toString(): string {
    try {
      return this.sql();
    } catch {
      return `${(this.constructor as typeof Expression).key}(...)`;
    }
  }

  // -- Condition builder methods (for chaining) -----------------------------

  and_(...expressions: Array<ExpOrStr | null | undefined>): Condition {
    return and_(this as any, ...(expressions.filter(Boolean) as ExpOrStr[]));
  }

  or_(...expressions: Array<ExpOrStr | null | undefined>): Condition {
    return or_(this as any, ...(expressions.filter(Boolean) as ExpOrStr[]));
  }

  not_(): Not {
    return not_(this as any);
  }

  as_(aliasName: string | Identifier, quoted?: boolean): Alias {
    const id =
      aliasName instanceof Identifier
        ? aliasName
        : toIdentifier(aliasName, quoted);
    return new Alias({ this: this.copy(), alias: id });
  }
}

// ---------------------------------------------------------------------------
// Expression Subclasses
// ---------------------------------------------------------------------------

export class Condition extends Expression {
  static override argTypes: Record<string, boolean> = { this: true };
  static override key = "condition";
}

export class Predicate extends Condition {
  static override key = "predicate";
}

export class DerivedTable extends Expression {
  static override key = "derivedtable";

  get selects(): Expression[] {
    const t = this.this_;
    if (t instanceof Query) return t.selects;
    return [];
  }

  get namedSelects(): string[] {
    return this.selects.map((s: Expression) => s.outputName);
  }
}

export class Query extends Expression {
  static override key = "query";

  get selects(): Expression[] {
    return [];
  }

  get namedSelects(): string[] {
    return [];
  }

  get ctes(): CTE[] {
    const w = this.args["with_"];
    if (w) return w.expressions;
    return [];
  }

  subquery(alias?: ExpOrStr): Subquery {
    let aliasExpr: Expression | undefined;
    if (alias !== undefined) {
      if (_isExpression(alias)) {
        aliasExpr = alias;
      } else {
        aliasExpr = new TableAlias({ this: toIdentifier(alias) });
      }
    }
    return new Subquery({ this: this, alias: aliasExpr });
  }
}

export class UDTF extends DerivedTable {
  static override key = "udtf";

  override get selects(): Expression[] {
    const a = this.args["alias"];
    return a ? (a.args["columns"] || []) : [];
  }
}

// ---------------------------------------------------------------------------
// Leaf / Simple Expression Types
// ---------------------------------------------------------------------------

export class Identifier extends Expression {
  static override argTypes: Record<string, boolean> = {
    this: true,
    quoted: false,
    global_: false,
    temporary: false,
  };
  static override key = "identifier";

  get quoted(): boolean {
    return !!this.args["quoted"];
  }

  override get outputName(): string {
    return this.name;
  }
}

export class Literal extends Condition {
  static override argTypes: Record<string, boolean> = { this: true, is_string: true };
  static override key = "literal";

  static number(value: number | string): Literal | Neg {
    let expr: Literal | Neg = new Literal({ this: String(value), is_string: false });
    try {
      const pyVal = (expr as Literal).toPy();
      if (typeof pyVal === "number" && pyVal < 0) {
        (expr as Literal).set("this", String(Math.abs(pyVal)));
        expr = new Neg({ this: expr });
      }
    } catch {
      // pass
    }
    return expr;
  }

  static string(value: string): Literal {
    return new Literal({ this: String(value), is_string: true });
  }

  override get outputName(): string {
    return this.name;
  }

  toPy(): number | string {
    if (this.isNumber) {
      const n = Number(this.this_);
      if (Number.isInteger(n)) return n;
      return n;
    }
    return this.this_;
  }
}

export class Star extends Expression {
  static override argTypes: Record<string, boolean> = {
    except_: false,
    replace: false,
    rename: false,
  };
  static override key = "star";

  override get name(): string {
    return "*";
  }

  override get outputName(): string {
    return this.name;
  }
}

export class Null extends Condition {
  static override argTypes: Record<string, boolean> = {};
  static override key = "null";

  override get name(): string {
    return "NULL";
  }
}

export class Boolean_ extends Condition {
  static override key = "boolean";
}
export { Boolean_ as Boolean };

export class DataType extends Expression {
  static override argTypes: Record<string, boolean> = {
    this: true,
    expressions: false,
    nested: false,
    values: false,
    prefix: false,
    kind: false,
    nullable: false,
  };
  static override key = "datatype";

  static Type = {
    ARRAY: "ARRAY",
    AGGREGATEFUNCTION: "AGGREGATEFUNCTION",
    SIMPLEAGGREGATEFUNCTION: "SIMPLEAGGREGATEFUNCTION",
    BIGDECIMAL: "BIGDECIMAL",
    BIGINT: "BIGINT",
    BIGNUM: "BIGNUM",
    BIGSERIAL: "BIGSERIAL",
    BINARY: "BINARY",
    BIT: "BIT",
    BLOB: "BLOB",
    BOOLEAN: "BOOLEAN",
    BPCHAR: "BPCHAR",
    CHAR: "CHAR",
    DATE: "DATE",
    DATE32: "DATE32",
    DATEMULTIRANGE: "DATEMULTIRANGE",
    DATERANGE: "DATERANGE",
    DATETIME: "DATETIME",
    DATETIME2: "DATETIME2",
    DATETIME64: "DATETIME64",
    DECIMAL: "DECIMAL",
    DECIMAL32: "DECIMAL32",
    DECIMAL64: "DECIMAL64",
    DECIMAL128: "DECIMAL128",
    DECIMAL256: "DECIMAL256",
    DECFLOAT: "DECFLOAT",
    DOUBLE: "DOUBLE",
    DYNAMIC: "DYNAMIC",
    ENUM: "ENUM",
    ENUM8: "ENUM8",
    ENUM16: "ENUM16",
    FILE: "FILE",
    FIXEDSTRING: "FIXEDSTRING",
    FLOAT: "FLOAT",
    GEOGRAPHY: "GEOGRAPHY",
    GEOGRAPHYPOINT: "GEOGRAPHYPOINT",
    GEOMETRY: "GEOMETRY",
    POINT: "POINT",
    RING: "RING",
    LINESTRING: "LINESTRING",
    MULTILINESTRING: "MULTILINESTRING",
    POLYGON: "POLYGON",
    MULTIPOLYGON: "MULTIPOLYGON",
    HLLSKETCH: "HLLSKETCH",
    HSTORE: "HSTORE",
    IMAGE: "IMAGE",
    INET: "INET",
    INT: "INT",
    INT128: "INT128",
    INT256: "INT256",
    INT4MULTIRANGE: "INT4MULTIRANGE",
    INT4RANGE: "INT4RANGE",
    INT8MULTIRANGE: "INT8MULTIRANGE",
    INT8RANGE: "INT8RANGE",
    INTERVAL: "INTERVAL",
    IPADDRESS: "IPADDRESS",
    IPPREFIX: "IPPREFIX",
    IPV4: "IPV4",
    IPV6: "IPV6",
    JSON: "JSON",
    JSONB: "JSONB",
    LIST: "LIST",
    LONGBLOB: "LONGBLOB",
    LONGTEXT: "LONGTEXT",
    LOWCARDINALITY: "LOWCARDINALITY",
    MAP: "MAP",
    MEDIUMBLOB: "MEDIUMBLOB",
    MEDIUMINT: "MEDIUMINT",
    MEDIUMTEXT: "MEDIUMTEXT",
    MONEY: "MONEY",
    NAME: "NAME",
    NCHAR: "NCHAR",
    NESTED: "NESTED",
    NOTHING: "NOTHING",
    NULL: "NULL",
    NUMMULTIRANGE: "NUMMULTIRANGE",
    NUMRANGE: "NUMRANGE",
    NVARCHAR: "NVARCHAR",
    OBJECT: "OBJECT",
    RANGE: "RANGE",
    ROWVERSION: "ROWVERSION",
    SERIAL: "SERIAL",
    SET: "SET",
    SMALLDATETIME: "SMALLDATETIME",
    SMALLINT: "SMALLINT",
    SMALLMONEY: "SMALLMONEY",
    SMALLSERIAL: "SMALLSERIAL",
    STRUCT: "STRUCT",
    SUPER: "SUPER",
    TEXT: "TEXT",
    TINYBLOB: "TINYBLOB",
    TINYTEXT: "TINYTEXT",
    TIME: "TIME",
    TIMETZ: "TIMETZ",
    TIME_NS: "TIME_NS",
    TIMESTAMP: "TIMESTAMP",
    TIMESTAMPNTZ: "TIMESTAMPNTZ",
    TIMESTAMPLTZ: "TIMESTAMPLTZ",
    TIMESTAMPTZ: "TIMESTAMPTZ",
    TIMESTAMP_S: "TIMESTAMP_S",
    TIMESTAMP_MS: "TIMESTAMP_MS",
    TIMESTAMP_NS: "TIMESTAMP_NS",
    TINYINT: "TINYINT",
    TSMULTIRANGE: "TSMULTIRANGE",
    TSRANGE: "TSRANGE",
    TSTZMULTIRANGE: "TSTZMULTIRANGE",
    TSTZRANGE: "TSTZRANGE",
    UBIGINT: "UBIGINT",
    UINT: "UINT",
    UINT128: "UINT128",
    UINT256: "UINT256",
    UMEDIUMINT: "UMEDIUMINT",
    UDECIMAL: "UDECIMAL",
    UDOUBLE: "UDOUBLE",
    UNION: "UNION",
    UNKNOWN: "UNKNOWN",
    USERDEFINED: "USER-DEFINED",
    USMALLINT: "USMALLINT",
    UTINYINT: "UTINYINT",
    UUID: "UUID",
    VARBINARY: "VARBINARY",
    VARCHAR: "VARCHAR",
    VARIANT: "VARIANT",
    VECTOR: "VECTOR",
    XML: "XML",
    YEAR: "YEAR",
    TDIGEST: "TDIGEST",
  } as const;

  static STRUCT_TYPES = new Set([
    DataType.Type.FILE,
    DataType.Type.NESTED,
    DataType.Type.OBJECT,
    DataType.Type.STRUCT,
    DataType.Type.UNION,
  ]);

  static ARRAY_TYPES = new Set([DataType.Type.ARRAY, DataType.Type.LIST]);

  static NESTED_TYPES = new Set([
    ...DataType.STRUCT_TYPES,
    ...DataType.ARRAY_TYPES,
    DataType.Type.MAP,
  ]);

  static TEXT_TYPES = new Set([
    DataType.Type.CHAR,
    DataType.Type.NCHAR,
    DataType.Type.NVARCHAR,
    DataType.Type.TEXT,
    DataType.Type.VARCHAR,
    DataType.Type.NAME,
  ]);

  static SIGNED_INTEGER_TYPES = new Set([
    DataType.Type.BIGINT,
    DataType.Type.INT,
    DataType.Type.INT128,
    DataType.Type.INT256,
    DataType.Type.MEDIUMINT,
    DataType.Type.SMALLINT,
    DataType.Type.TINYINT,
  ]);

  static UNSIGNED_INTEGER_TYPES = new Set([
    DataType.Type.UBIGINT,
    DataType.Type.UINT,
    DataType.Type.UINT128,
    DataType.Type.UINT256,
    DataType.Type.UMEDIUMINT,
    DataType.Type.USMALLINT,
    DataType.Type.UTINYINT,
  ]);

  static INTEGER_TYPES = new Set([
    ...DataType.SIGNED_INTEGER_TYPES,
    ...DataType.UNSIGNED_INTEGER_TYPES,
    DataType.Type.BIT,
  ]);

  static FLOAT_TYPES = new Set([DataType.Type.DOUBLE, DataType.Type.FLOAT]);

  static REAL_TYPES = new Set([
    ...DataType.FLOAT_TYPES,
    DataType.Type.BIGDECIMAL,
    DataType.Type.DECIMAL,
    DataType.Type.DECIMAL32,
    DataType.Type.DECIMAL64,
    DataType.Type.DECIMAL128,
    DataType.Type.DECIMAL256,
    DataType.Type.DECFLOAT,
    DataType.Type.MONEY,
    DataType.Type.SMALLMONEY,
    DataType.Type.UDECIMAL,
    DataType.Type.UDOUBLE,
  ]);

  static NUMERIC_TYPES = new Set([
    ...DataType.INTEGER_TYPES,
    ...DataType.REAL_TYPES,
  ]);

  static TEMPORAL_TYPES = new Set([
    DataType.Type.DATE,
    DataType.Type.DATE32,
    DataType.Type.DATETIME,
    DataType.Type.DATETIME2,
    DataType.Type.DATETIME64,
    DataType.Type.SMALLDATETIME,
    DataType.Type.TIME,
    DataType.Type.TIMESTAMP,
    DataType.Type.TIMESTAMPNTZ,
    DataType.Type.TIMESTAMPLTZ,
    DataType.Type.TIMESTAMPTZ,
    DataType.Type.TIMESTAMP_MS,
    DataType.Type.TIMESTAMP_NS,
    DataType.Type.TIMESTAMP_S,
    DataType.Type.TIMETZ,
  ]);

  static build(
    dtype: string | DataType | (typeof DataType.Type)[keyof typeof DataType.Type],
    opts?: { dialect?: string; copy?: boolean; udt?: boolean },
  ): DataType {
    const copy = opts?.copy !== false;

    if (typeof dtype === "string") {
      if (dtype.toUpperCase() === "UNKNOWN") {
        return new DataType({ this: DataType.Type.UNKNOWN });
      }
      const upper = dtype.toUpperCase().replace(/\s+/g, "");
      const typeVal = (DataType.Type as Record<string, string>)[upper];
      if (typeVal) {
        return new DataType({ this: typeVal });
      }
      if (opts?.udt) {
        return new DataType({ this: DataType.Type.USERDEFINED, kind: dtype });
      }
      return new DataType({ this: dtype });
    }
    if (dtype instanceof DataType) {
      return copy ? (dtype.copy() as DataType) : dtype;
    }
    // It's a Type enum value string
    return new DataType({ this: dtype });
  }

  isType(
    ...dtypes: Array<string | DataType | (typeof DataType.Type)[keyof typeof DataType.Type]>
  ): boolean {
    for (const dtype of dtypes) {
      const otherType = DataType.build(dtype, { copy: false, udt: true });
      if (
        otherType.expressions.length > 0 ||
        this.this_ === DataType.Type.USERDEFINED ||
        otherType.this_ === DataType.Type.USERDEFINED
      ) {
        if (this.eq(otherType)) return true;
      } else {
        if (this.this_ === otherType.this_) return true;
      }
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Statement / Query nodes
// ---------------------------------------------------------------------------

export class Comment extends Expression {
  static override argTypes: Record<string, boolean> = {
    this: true,
    kind: true,
    expression: true,
    exists: false,
    materialized: false,
  };
  static override key = "comment";
}

export class With extends Expression {
  static override argTypes: Record<string, boolean> = {
    expressions: true,
    recursive: false,
    search: false,
  };
  static override key = "with";

  get recursive(): boolean {
    return !!this.args["recursive"];
  }
}

export class CTE extends DerivedTable {
  static override argTypes: Record<string, boolean> = {
    this: true,
    alias: true,
    scalar: false,
    materialized: false,
    key_expressions: false,
  };
  static override key = "cte";
}

export class TableAlias extends Expression {
  static override argTypes: Record<string, boolean> = { this: false, columns: false };
  static override key = "tablealias";

  get columns(): Expression[] {
    return this.args["columns"] || [];
  }
}

export class Column extends Condition {
  static override argTypes: Record<string, boolean> = {
    this: true,
    table: false,
    db: false,
    catalog: false,
    join_mark: false,
  };
  static override key = "column";

  get table(): string {
    return this.text("table");
  }

  get db(): string {
    return this.text("db");
  }

  get catalog(): string {
    return this.text("catalog");
  }

  override get outputName(): string {
    return this.name;
  }

  get parts(): Identifier[] {
    const result: Identifier[] = [];
    for (const part of ["catalog", "db", "table", "this"] as const) {
      const v = this.args[part];
      if (v) result.push(v as Identifier);
    }
    return result;
  }
}

export class From extends Expression {
  static override argTypes: Record<string, boolean> = { this: true };
  static override key = "from";

  override get name(): string {
    return this.this_?.name ?? "";
  }

  override get aliasOrName(): string {
    return this.this_?.aliasOrName ?? "";
  }
}

export class Having extends Expression {
  static override argTypes: Record<string, boolean> = { this: true };
  static override key = "having";
}

export class Where extends Expression {
  static override argTypes: Record<string, boolean> = { this: true };
  static override key = "where";
}

export class Group extends Expression {
  static override argTypes: Record<string, boolean> = {
    expressions: false,
    grouping_sets: false,
    cube: false,
    rollup: false,
    totals: false,
    all: false,
  };
  static override key = "group";
}

export class Order extends Expression {
  static override argTypes: Record<string, boolean> = {
    this: false,
    expressions: true,
    siblings: false,
  };
  static override key = "order";
}

export class Ordered extends Expression {
  static override argTypes: Record<string, boolean> = {
    this: true,
    desc: false,
    nulls_first: true,
    with_fill: false,
  };
  static override key = "ordered";

  override get name(): string {
    return this.this_?.name ?? "";
  }
}

export class Limit extends Expression {
  static override argTypes: Record<string, boolean> = {
    this: false,
    expression: true,
    offset: false,
    limit_options: false,
    expressions: false,
  };
  static override key = "limit";
}

export class Offset extends Expression {
  static override argTypes: Record<string, boolean> = {
    this: false,
    expression: true,
    expressions: false,
  };
  static override key = "offset";
}

export class Join extends Expression {
  static override argTypes: Record<string, boolean> = {
    this: true,
    on: false,
    side: false,
    kind: false,
    using: false,
    method: false,
    global_: false,
    hint: false,
    match_condition: false,
    directed: false,
    expressions: false,
    pivots: false,
  };
  static override key = "join";

  get method(): string {
    return this.text("method").toUpperCase();
  }

  get kind(): string {
    return this.text("kind").toUpperCase();
  }

  get side(): string {
    return this.text("side").toUpperCase();
  }

  get hint_(): string {
    return this.text("hint").toUpperCase();
  }

  override get aliasOrName(): string {
    return this.this_?.aliasOrName ?? "";
  }
}

export class Lateral extends UDTF {
  static override argTypes: Record<string, boolean> = {
    this: true,
    view: false,
    outer: false,
    alias: false,
    cross_apply: false,
    ordinality: false,
  };
  static override key = "lateral";
}

export class Table extends Expression {
  static override argTypes: Record<string, boolean> = {
    this: false,
    alias: false,
    db: false,
    catalog: false,
    laterals: false,
    joins: false,
    pivots: false,
    hints: false,
    system_time: false,
    version: false,
    format: false,
    pattern: false,
    ordinality: false,
    when: false,
    only: false,
    partition: false,
    changes: false,
    rows_from: false,
    sample: false,
    indexed: false,
  };
  static override key = "table";

  override get name(): string {
    const t = this.this_;
    if (!t || t instanceof Func) return "";
    return t.name;
  }

  get db(): string {
    return this.text("db");
  }

  get catalog(): string {
    return this.text("catalog");
  }

  get selects(): Expression[] {
    return [];
  }

  get namedSelects(): string[] {
    return [];
  }

  get parts(): Expression[] {
    const result: Expression[] = [];
    for (const arg of ["catalog", "db", "this"] as const) {
      const part = this.args[arg];
      if (part instanceof Dot) {
        result.push(...part.flatten());
      } else if (_isExpression(part)) {
        result.push(part);
      }
    }
    return result;
  }
}

export class Schema extends Expression {
  static override argTypes: Record<string, boolean> = { this: false, expressions: false };
  static override key = "schema";
}

export class Paren extends Expression {
  static override argTypes: Record<string, boolean> = { this: true };
  static override key = "paren";

  override get outputName(): string {
    return this.this_?.name ?? "";
  }
}

export class Alias extends Expression {
  static override argTypes: Record<string, boolean> = { this: true, alias: false };
  static override key = "alias";

  override get outputName(): string {
    return this.alias;
  }
}

// ---------------------------------------------------------------------------
// Distinct
// ---------------------------------------------------------------------------

export class Distinct extends Expression {
  static override argTypes: Record<string, boolean> = { expressions: false, on: false };
  static override key = "distinct";
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

export class Select extends Query {
  static override argTypes: Record<string, boolean> = {
    with_: false,
    kind: false,
    expressions: false,
    hint: false,
    distinct: false,
    into: false,
    from_: false,
    operation_modifiers: false,
    exclude: false,
    ...QUERY_MODIFIERS,
  };
  static override key = "select";

  override get selects(): Expression[] {
    return this.expressions;
  }

  override get namedSelects(): string[] {
    return this.selects.map((s: Expression) => s.outputName);
  }

  get isStar(): boolean {
    return this.selects.some((s: Expression) => s.isStar);
  }

  from_(
    expression: ExpOrStr,
    opts?: { dialect?: string; copy?: boolean },
  ): Select {
    const copy = opts?.copy !== false;
    const instance = _maybeCopy(this, copy);
    const parsed =
      typeof expression === "string"
        ? maybeParse(expression, { into: Table })
        : expression;
    const from = parsed instanceof From ? parsed : new From({ this: parsed });
    instance.set("from_", from);
    return instance;
  }

  select(
    ...expressions: Array<ExpOrStr | null | undefined>
  ): Select {
    const instance = this.copy();
    const current: any[] = instance.args["expressions"] || [];
    for (const expr of expressions) {
      if (expr === null || expr === undefined) continue;
      const parsed =
        typeof expr === "string" ? maybeParse(expr) : expr;
      current.push(parsed);
    }
    instance.set("expressions", current);
    return instance;
  }

  where(
    expression: ExpOrStr | null | undefined,
    opts?: { dialect?: string; copy?: boolean; append?: boolean },
  ): Select {
    if (expression === null || expression === undefined) return this;
    const copy = opts?.copy !== false;
    const append = opts?.append !== false;
    const instance = _maybeCopy(this, copy);
    const parsed =
      typeof expression === "string" ? maybeParse(expression) : expression;

    const existing = instance.args["where"];
    if (append && existing) {
      const combined = new And({
        this: existing.this_,
        expression: parsed,
      });
      existing.set("this", combined);
    } else {
      const w = parsed instanceof Where ? parsed : new Where({ this: parsed });
      instance.set("where", w);
    }
    return instance;
  }

  having(
    expression: ExpOrStr | null | undefined,
    opts?: { dialect?: string; copy?: boolean; append?: boolean },
  ): Select {
    if (expression === null || expression === undefined) return this;
    const copy = opts?.copy !== false;
    const append = opts?.append !== false;
    const instance = _maybeCopy(this, copy);
    const parsed =
      typeof expression === "string" ? maybeParse(expression) : expression;

    const existing = instance.args["having"];
    if (append && existing) {
      const combined = new And({
        this: existing.this_,
        expression: parsed,
      });
      existing.set("this", combined);
    } else {
      const h = parsed instanceof Having ? parsed : new Having({ this: parsed });
      instance.set("having", h);
    }
    return instance;
  }

  join(
    expression: ExpOrStr,
    opts?: {
      on?: ExpOrStr;
      using?: ExpOrStr | string[];
      append?: boolean;
      joinType?: string;
      dialect?: string;
      copy?: boolean;
    },
  ): Select {
    const copy = opts?.copy !== false;
    const append = opts?.append !== false;
    const instance = _maybeCopy(this, copy);

    const parsed =
      typeof expression === "string" ? maybeParse(expression, { into: Table }) : expression;
    const join = parsed instanceof Join ? parsed : new Join({ this: parsed });

    if (opts?.joinType) {
      const parts = opts.joinType.trim().split(/\s+/);
      if (parts.length === 1) {
        join.set("kind", parts[0]);
      } else if (parts.length === 2) {
        join.set("side", parts[0]);
        join.set("kind", parts[1]);
      } else if (parts.length >= 3) {
        join.set("method", parts[0]);
        join.set("side", parts[1]);
        join.set("kind", parts[2]);
      }
    }

    if (opts?.on) {
      const onExpr =
        typeof opts.on === "string" ? maybeParse(opts.on) : opts.on;
      join.set("on", onExpr);
    }

    const joins: any[] = append ? [...(instance.args["joins"] || [])] : [];
    joins.push(join);
    instance.set("joins", joins);
    return instance;
  }

  groupBy(
    ...expressions: Array<ExpOrStr | null | undefined>
  ): Select {
    const instance = this.copy();
    const filtered = expressions.filter(
      (e): e is ExpOrStr => e !== null && e !== undefined,
    );
    if (filtered.length === 0) return instance;

    const parsed = filtered.map((e) =>
      typeof e === "string" ? maybeParse(e) : e,
    );
    const group =
      instance.args["group"] instanceof Group
        ? instance.args["group"]
        : new Group({});
    const existing: any[] = group.args["expressions"] || [];
    group.set("expressions", [...existing, ...parsed]);
    instance.set("group", group);
    return instance;
  }

  orderBy(
    ...expressions: Array<ExpOrStr | null | undefined>
  ): Select {
    const instance = this.copy();
    const filtered = expressions.filter(
      (e): e is ExpOrStr => e !== null && e !== undefined,
    );
    if (filtered.length === 0) return instance;

    const parsed = filtered.map((e) =>
      typeof e === "string" ? maybeParse(e) : e,
    );
    const order =
      instance.args["order"] instanceof Order
        ? instance.args["order"]
        : new Order({});
    const existing: any[] = order.args["expressions"] || [];
    order.set("expressions", [...existing, ...parsed]);
    instance.set("order", order);
    return instance;
  }

  limit(expression: ExpOrStr | number): Select {
    const instance = this.copy();
    const limitExpr =
      typeof expression === "number"
        ? Literal.number(expression)
        : typeof expression === "string"
          ? maybeParse(expression)
          : expression;
    instance.set("limit", new Limit({ expression: limitExpr }));
    return instance;
  }

  offset(expression: ExpOrStr | number): Select {
    const instance = this.copy();
    const offsetExpr =
      typeof expression === "number"
        ? Literal.number(expression)
        : typeof expression === "string"
          ? maybeParse(expression)
          : expression;
    instance.set("offset", new Offset({ expression: offsetExpr }));
    return instance;
  }
}

// ---------------------------------------------------------------------------
// Subquery
// ---------------------------------------------------------------------------

export class Subquery extends DerivedTable {
  static override argTypes: Record<string, boolean> = {
    this: true,
    alias: false,
    with_: false,
    ...QUERY_MODIFIERS,
  };
  static override key = "subquery";

  override unnest(): Expression {
    let expression: Expression = this;
    while (expression instanceof Subquery) {
      expression = expression.this_;
    }
    return expression;
  }

  override get outputName(): string {
    return this.alias;
  }

  get isStar(): boolean {
    return this.this_?.isStar ?? false;
  }

  override get selects(): Expression[] {
    const inner = this.unnest();
    return (inner as any)?.expressions ?? [];
  }
}

// ---------------------------------------------------------------------------
// Set Operations
// ---------------------------------------------------------------------------

export class SetOperation extends Query {
  static override argTypes: Record<string, boolean> = {
    with_: false,
    this: true,
    expression: true,
    distinct: false,
    by_name: false,
    side: false,
    kind: false,
    on: false,
    ...QUERY_MODIFIERS,
  };
  static override key = "setoperation";

  override get namedSelects(): string[] {
    let expression: Expression = this;
    while (expression instanceof SetOperation) {
      expression = expression.this_.unnest();
    }
    return (expression as any).namedSelects ?? [];
  }

  get isStar(): boolean {
    return this.this_?.isStar || this.expression?.isStar;
  }

  override get selects(): Expression[] {
    let expression: Expression = this;
    while (expression instanceof SetOperation) {
      expression = expression.this_.unnest();
    }
    return (expression as any).selects ?? [];
  }

  get left(): Query {
    return this.this_;
  }

  get right(): Query {
    return this.expression;
  }
}

export class Union extends SetOperation {
  static override key = "union";
}

export class Intersect extends SetOperation {
  static override key = "intersect";
}

export class Except extends SetOperation {
  static override key = "except";
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export class Values extends UDTF {
  static override argTypes: Record<string, boolean> = {
    expressions: true,
    alias: false,
    order: false,
    limit: false,
    offset: false,
  };
  static override key = "values";
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

export class Window extends Condition {
  static override argTypes: Record<string, boolean> = {
    this: true,
    partition_by: false,
    order: false,
    spec: false,
    alias: false,
    over: false,
    first: false,
  };
  static override key = "window";
}

export class WindowSpec extends Expression {
  static override argTypes: Record<string, boolean> = {
    kind: false,
    start: false,
    start_side: false,
    end: false,
    end_side: false,
    exclude: false,
  };
  static override key = "windowspec";
}

// ---------------------------------------------------------------------------
// Binary Expressions
// ---------------------------------------------------------------------------

export class Binary extends Condition {
  static override argTypes: Record<string, boolean> = { this: true, expression: true };
  static override key = "binary";

  get left(): Expression {
    return this.this_;
  }

  get right(): Expression {
    return this.expression;
  }
}

export class Add extends Binary {
  static override key = "add";
}

export class Connector extends Binary {
  static override key = "connector";
}

export class Sub extends Binary {
  static override key = "sub";
}

export class Mul extends Binary {
  static override key = "mul";
}

export class Div extends Binary {
  static override argTypes: Record<string, boolean> = {
    this: true,
    expression: true,
    typed: false,
    safe: false,
  };
  static override key = "div";
}

export class Mod extends Binary {
  static override key = "mod";
}

export class Dot extends Binary {
  static override key = "dot";

  get isStar(): boolean {
    return this.expression?.isStar ?? false;
  }

  override get name(): string {
    return this.expression?.name ?? "";
  }

  override get outputName(): string {
    return this.name;
  }

  static build(expressions: Expression[]): Dot {
    if (expressions.length < 2) {
      throw new Error("Dot requires >= 2 expressions.");
    }
    return expressions.reduce(
      (acc, expr) => new Dot({ this: acc, expression: expr }),
    ) as Dot;
  }

  get parts(): Expression[] {
    const result: Expression[] = [];
    for (const node of this.flatten()) {
      result.push(node);
    }
    return result;
  }
}

export class Bracket extends Condition {
  static override argTypes: Record<string, boolean> = {
    this: true,
    expressions: true,
    offset: false,
    safe: false,
    returns_list_for_maps: false,
  };
  static override key = "bracket";

  override get outputName(): string {
    if (this.expressions.length === 1) {
      return this.expressions[0].outputName;
    }
    return super.outputName;
  }
}

// Predicate Binary expressions
export class EQ extends Binary {
  static override key = "eq";
}

export class NEQ extends Binary {
  static override key = "neq";
}

export class GT extends Binary {
  static override key = "gt";
}

export class GTE extends Binary {
  static override key = "gte";
}

export class LT extends Binary {
  static override key = "lt";
}

export class LTE extends Binary {
  static override key = "lte";
}

export class Is extends Binary {
  static override key = "is";
}

export class Like extends Binary {
  static override key = "like";
}

export class ILike extends Binary {
  static override key = "ilike";
}

// ---------------------------------------------------------------------------
// Unary Expressions
// ---------------------------------------------------------------------------

export class Unary extends Condition {
  static override argTypes: Record<string, boolean> = { this: true };
  static override key = "unary";
}

export class Not extends Unary {
  static override key = "not";
}

export class Neg extends Unary {
  static override key = "neg";
}

// ---------------------------------------------------------------------------
// Predicate Expressions
// ---------------------------------------------------------------------------

export class SubqueryPredicate extends Predicate {
  static override key = "subquerypredicate";
}

export class All extends SubqueryPredicate {
  static override key = "all";
}

export class Any extends SubqueryPredicate {
  static override key = "any";
}

export class In extends Predicate {
  static override argTypes: Record<string, boolean> = {
    this: true,
    expressions: false,
    query: false,
    unnest: false,
    field: false,
    is_global: false,
  };
  static override key = "in";
}

export class Between extends Predicate {
  static override argTypes: Record<string, boolean> = {
    this: true,
    low: true,
    high: true,
    symmetric: false,
  };
  static override key = "between";
}

export class Exists extends Expression {
  static override argTypes: Record<string, boolean> = { this: true, expression: false };
  static override key = "exists";
}

// ---------------------------------------------------------------------------
// And / Or (both Connector and Func in Python)
// ---------------------------------------------------------------------------

export class And extends Connector {
  static override key = "and";
}

export class Or extends Connector {
  static override key = "or";
}

// ---------------------------------------------------------------------------
// Tuple / Array / Interval
// ---------------------------------------------------------------------------

export class Tuple extends Expression {
  static override argTypes: Record<string, boolean> = { expressions: false };
  static override key = "tuple";
}

export class Interval extends Expression {
  static override argTypes: Record<string, boolean> = { this: false, unit: false };
  static override key = "interval";
}

// ---------------------------------------------------------------------------
// Func base class
// ---------------------------------------------------------------------------

export class Func extends Condition {
  static override key = "func";
  static isVarLenArgs: boolean = false;

  static sqlNames(): string[] {
    if (this === Func) {
      throw new Error(
        "SQL name is only supported by concrete function implementations",
      );
    }
    if (!(this as any)._sqlNames) {
      // Convert PascalCase to snake_case
      const name = this.name
        .replace(/([A-Z])/g, "_$1")
        .toLowerCase()
        .replace(/^_/, "");
      (this as any)._sqlNames = [name];
    }
    return (this as any)._sqlNames;
  }

  static sqlName(): string {
    return this.sqlNames()[0]!;
  }
}

export class AggFunc extends Func {
  static override key = "aggfunc";
}

export class Anonymous extends Func {
  static override argTypes: Record<string, boolean> = { this: true, expressions: false };
  static override isVarLenArgs = true;
  static override key = "anonymous";

  override get name(): string {
    const t = this.this_;
    if (typeof t === "string") return t;
    return t?.name ?? "";
  }
}

export class Array_ extends Func {
  static override key = "array";
  static override argTypes: Record<string, boolean> = {
    expressions: false,
    bracket_notation: false,
    struct_name_inheritance: false,
  };
  static override isVarLenArgs = true;
}
export { Array_ as Array };

// ---------------------------------------------------------------------------
// Aggregate Functions
// ---------------------------------------------------------------------------

export class Count extends AggFunc {
  static override argTypes: Record<string, boolean> = {
    this: false,
    expressions: false,
    big_int: false,
  };
  static override isVarLenArgs = true;
  static override key = "count";
}

export class Sum extends AggFunc {
  static override key = "sum";
}

export class Avg extends AggFunc {
  static override key = "avg";
}

export class Min extends AggFunc {
  static override argTypes: Record<string, boolean> = {
    this: true,
    expressions: false,
  };
  static override isVarLenArgs = true;
  static override key = "min";
}

export class Max extends AggFunc {
  static override argTypes: Record<string, boolean> = {
    this: true,
    expressions: false,
  };
  static override isVarLenArgs = true;
  static override key = "max";
}

// ---------------------------------------------------------------------------
// Date/Time Functions
// ---------------------------------------------------------------------------

export class CurrentDate extends Func {
  static override argTypes: Record<string, boolean> = { this: false };
  static override key = "currentdate";
}

export class CurrentTime extends Func {
  static override argTypes: Record<string, boolean> = { this: false };
  static override key = "currenttime";
}

export class CurrentTimestamp extends Func {
  static override argTypes: Record<string, boolean> = { this: false, sysdate: false };
  static override key = "currenttimestamp";
}

export class CurrentDatetime extends Func {
  static override argTypes: Record<string, boolean> = { this: false };
  static override key = "currentdatetime";
}

// ---------------------------------------------------------------------------
// Other Functions
// ---------------------------------------------------------------------------

export class Case extends Func {
  static override argTypes: Record<string, boolean> = {
    this: false,
    ifs: true,
    default: false,
  };
  static override key = "case";

  when(condition: ExpOrStr, then: ExpOrStr): Case {
    const instance = this.copy() as Case;
    const condExpr =
      typeof condition === "string" ? maybeParse(condition) : condition;
    const thenExpr =
      typeof then === "string" ? maybeParse(then) : then;
    instance.append(
      "ifs",
      new If({ this: condExpr, true: thenExpr }),
    );
    return instance;
  }

  else_(condition: ExpOrStr): Case {
    const instance = this.copy() as Case;
    const parsed =
      typeof condition === "string" ? maybeParse(condition) : condition;
    instance.set("default", parsed);
    return instance;
  }
}

export class If extends Func {
  static override argTypes: Record<string, boolean> = {
    this: true,
    true: true,
    false: false,
  };
  static override key = "if";
}

export class Extract extends Func {
  static override argTypes: Record<string, boolean> = { this: true, expression: true };
  static override key = "extract";
}

export class Cast extends Func {
  static override argTypes: Record<string, boolean> = {
    this: true,
    to: true,
    format: false,
    safe: false,
    action: false,
    default: false,
  };
  static override key = "cast";

  override get name(): string {
    return this.this_?.name ?? "";
  }

  get to(): DataType {
    return this.args["to"];
  }

  override get outputName(): string {
    return this.name;
  }

  override isType(
    ...dtypes: Array<string | DataType | (typeof DataType.Type)[keyof typeof DataType.Type]>
  ): boolean {
    return this.to.isType(...dtypes);
  }
}

export class TryCast extends Cast {
  static override argTypes: Record<string, boolean> = {
    ...Cast.argTypes,
    requires_string: false,
  };
  static override key = "trycast";
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Parse a string into an Expression, or return the expression as-is.
 * This is a stub that will be wired to the real parser later.
 */
export function maybeParse(
  sqlOrExpression: ExpOrStr,
  opts?: {
    into?: IntoType;
    dialect?: string;
    prefix?: string;
    copy?: boolean;
  },
): Expression {
  if (_isExpression(sqlOrExpression)) {
    return opts?.copy ? sqlOrExpression.copy() : sqlOrExpression;
  }

  // Try to use the dialect module's parser if available
  if (_dialectModule) {
    let sql = String(sqlOrExpression);
    if (opts?.prefix) {
      sql = `${opts.prefix} ${sql}`;
    }
    try {
      return _dialectModule.Dialect.getOrRaise(opts?.dialect).parseInto(
        opts?.into,
        sql,
      );
    } catch {
      // Fall through to stub
    }
  }

  // Stub: wrap in Anonymous if we can't parse
  return new Anonymous({ this: String(sqlOrExpression), expressions: [] });
}

/**
 * Build an Identifier expression.
 */
export function toIdentifier(
  name: string | Identifier | null | undefined,
  quoted?: boolean,
  copy: boolean = true,
): Identifier | undefined {
  if (name === null || name === undefined) return undefined;

  if (name instanceof Identifier) {
    return copy ? (name.copy() as Identifier) : name;
  }

  return new Identifier({
    this: name,
    quoted: quoted ?? !SAFE_IDENTIFIER_RE.test(name),
  });
}

/**
 * Create a Column from a `[table].[column]` sql path.
 */
export function toColumn(
  sqlPath: string | Column,
  opts?: { quoted?: boolean; dialect?: string; copy?: boolean },
): Column {
  if (sqlPath instanceof Column) {
    return opts?.copy !== false ? (sqlPath.copy() as Column) : sqlPath;
  }

  const parts = sqlPath.split(".").reverse();
  const col = parts[0] ?? sqlPath;
  const table = parts[1] ?? null;
  const db = parts[2] ?? null;
  const catalog = parts[3] ?? null;
  return column(col, table, db, catalog, { quoted: opts?.quoted }) as Column;
}

/**
 * Create a Select expression with the given column expressions.
 */
export function select(...expressions: ExpOrStr[]): Select {
  return new Select({}).select(...expressions);
}

/**
 * Create a Select expression from a FROM clause.
 */
export function from_(table: ExpOrStr): Select {
  return new Select({}).from_(table);
}

/**
 * Initialize a logical condition expression.
 */
export function condition(
  expression: ExpOrStr,
  opts?: { dialect?: string; copy?: boolean },
): Condition {
  return maybeParse(expression, {
    into: Condition as any,
    dialect: opts?.dialect,
    copy: opts?.copy,
  }) as Condition;
}

/**
 * Combine multiple conditions with AND.
 */
export function and_(
  ...expressions: Array<ExpOrStr | null | undefined>
): Condition {
  const conditions = expressions
    .filter((e): e is ExpOrStr => e !== null && e !== undefined)
    .map((e) => (typeof e === "string" ? condition(e) : e));

  if (conditions.length === 0) {
    throw new Error("and_ requires at least one expression");
  }

  let [result, ...rest] = conditions;
  if (rest.length > 0) {
    result = (_wrap(result as any, Connector) as any) ?? result;
  }
  for (const expr of rest) {
    result = new And({
      this: result,
      expression: _wrap(expr as any, Connector) ?? expr,
    });
  }
  return result as Condition;
}

/**
 * Combine multiple conditions with OR.
 */
export function or_(
  ...expressions: Array<ExpOrStr | null | undefined>
): Condition {
  const conditions = expressions
    .filter((e): e is ExpOrStr => e !== null && e !== undefined)
    .map((e) => (typeof e === "string" ? condition(e) : e));

  if (conditions.length === 0) {
    throw new Error("or_ requires at least one expression");
  }

  let [result, ...rest] = conditions;
  if (rest.length > 0) {
    result = (_wrap(result as any, Connector) as any) ?? result;
  }
  for (const expr of rest) {
    result = new Or({
      this: result,
      expression: _wrap(expr as any, Connector) ?? expr,
    });
  }
  return result as Condition;
}

/**
 * Wrap a condition with NOT.
 */
export function not_(expression: ExpOrStr, opts?: { copy?: boolean }): Not {
  const cond =
    typeof expression === "string"
      ? condition(expression)
      : opts?.copy !== false
        ? (expression as Expression).copy()
        : expression;
  return new Not({ this: _wrap(cond as any, Connector) ?? cond });
}

/**
 * Create a Null expression.
 */
export function null_(): Null {
  return new Null({});
}

/**
 * Build a Column expression.
 */
export function column(
  col: string | Identifier | Star,
  table?: string | Identifier | null,
  db?: string | Identifier | null,
  catalog?: string | Identifier | null,
  opts?: { fields?: Array<string | Identifier>; quoted?: boolean; copy?: boolean },
): Column | Dot {
  const quoted = opts?.quoted;
  const copy = opts?.copy !== false;

  const colExpr =
    col instanceof Star ? col : toIdentifier(col as string | Identifier, quoted, copy);

  const result = new Column({
    this: colExpr,
    table: table ? toIdentifier(table as string | Identifier, quoted, copy) : undefined,
    db: db ? toIdentifier(db as string | Identifier, quoted, copy) : undefined,
    catalog: catalog
      ? toIdentifier(catalog as string | Identifier, quoted, copy)
      : undefined,
  });

  if (opts?.fields && opts.fields.length > 0) {
    return Dot.build([
      result,
      ...opts.fields.map((f) =>
        toIdentifier(f as string | Identifier, quoted, copy)!,
      ),
    ]);
  }

  return result;
}

/**
 * Cast an expression to a data type.
 */
export function cast(expression: ExpOrStr, to: string | DataType): Cast {
  const expr =
    typeof expression === "string" ? maybeParse(expression) : expression;
  const dataType = typeof to === "string" ? DataType.build(to) : to;
  const castExpr = new Cast({ this: expr, to: dataType });
  castExpr._type = dataType;
  return castExpr;
}

// ---------------------------------------------------------------------------
// Registry: map key -> class (useful for deserialization/generator dispatch)
// ---------------------------------------------------------------------------

export const EXPRESSION_CLASSES: Record<string, typeof Expression> = {};

const _allClasses: Array<typeof Expression> = [
  Expression,
  Condition,
  Predicate,
  DerivedTable,
  Query,
  UDTF,
  Identifier,
  Literal,
  Star,
  Null,
  Boolean_,
  DataType,
  Comment,
  With,
  CTE,
  TableAlias,
  Column,
  From,
  Having,
  Where,
  Group,
  Order,
  Ordered,
  Limit,
  Offset,
  Join,
  Lateral,
  Table,
  Schema,
  Paren,
  Alias,
  Select,
  Subquery,
  SetOperation,
  Union,
  Intersect,
  Except,
  Values,
  Window,
  WindowSpec,
  Binary,
  Add,
  Connector,
  Sub,
  Mul,
  Div,
  Mod,
  Dot,
  Bracket,
  EQ,
  NEQ,
  GT,
  GTE,
  LT,
  LTE,
  Is,
  Like,
  ILike,
  Unary,
  Not,
  Neg,
  SubqueryPredicate,
  All,
  Any,
  In,
  Between,
  Exists,
  And,
  Or,
  Tuple,
  Interval,
  Func,
  AggFunc,
  Anonymous,
  Array_,
  Count,
  Sum,
  Avg,
  Min,
  Max,
  CurrentDate,
  CurrentTime,
  CurrentTimestamp,
  CurrentDatetime,
  Case,
  If,
  Extract,
  Cast,
  TryCast,
];

for (const cls of _allClasses) {
  EXPRESSION_CLASSES[cls.key] = cls;
}
