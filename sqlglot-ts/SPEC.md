# sqlglot-ts Specification

## Overview

A TypeScript port of [sqlglot](https://github.com/tobymao/sqlglot) — a no-dependency SQL parser, transpiler, and lineage tracer that runs in the browser and Node.js. The goal is a faithful port of the Python codebase with idiomatic TypeScript types.

## Scope

### In scope (initial release)

| Subsystem | Description |
|-----------|-------------|
| **Tokenizer** | Lexical analysis, `TokenType` enum, dialect-specific keyword/token mappings |
| **Parser** | Recursive descent parser producing AST. Dialect-specific parse rules. |
| **Generator** | AST → SQL string. Dialect-specific generation rules, pretty printing. |
| **Expressions** | Full AST node class hierarchy (~850+ classes), codegen'd from Python |
| **Lineage** | Column-level lineage tracing through queries |
| **Dialects** | PostgreSQL, MySQL (base "sqlglot" dialect always included) |

### Out of scope (future work)

- Optimizer (qualify, simplify, type annotation, pushdown)
- In-memory SQL engine
- All other dialects (Snowflake, DuckDB, BigQuery, etc.)
- Rust/WASM tokenizer

## Architecture

### AST Typing: Hybrid class hierarchy + discriminant

Every Expression subclass gets:
1. A class in the inheritance hierarchy (mirrors Python)
2. A `readonly type` discriminant field for TS type narrowing
3. Multiple inheritance traits modeled as interfaces

```typescript
abstract class Expression {
  abstract readonly type: string;

  // Internal storage for generic algorithms (walk, copy, transform)
  protected _args: Record<string, any> = {};

  // Bidirectional parent/child links
  parent?: Expression;
  argKey?: string;
  index?: number;

  // Base property accessors
  get this_(): any { return this._args.this; }
  get expression(): any { return this._args.expression; }
  get expressions(): Expression[] { return this._args.expressions ?? []; }

  // Generic mutation
  set(key: string, value: any, index?: number): void;
  append(key: string, value: any): void;

  // Traversal
  walk(opts?: { bfs?: boolean }): Iterable<Expression>;
  find<T extends Expression>(type: Constructor<T>): T | undefined;
  findAll<T extends Expression>(type: Constructor<T>): Iterable<T>;
  findAncestor<T extends Expression>(...types: Constructor<T>[]): T | undefined;
  *iterExpressions(): Iterable<Expression>;

  // Transformation
  transform(fn: (node: Expression) => Expression, opts?: { copy?: boolean }): Expression;
  copy(): this;

  // Helpers
  text(key: string): string;
  get name(): string;
  get alias(): string;
  get outputName(): string;
  isType(...types: DataType.Type[]): boolean;
  get isString(): boolean;
  get isNumber(): boolean;
  get isLeaf(): boolean;
  toPy(): string | number | boolean | null;
}
```

Subclasses narrow types:

```typescript
class Select extends Query {
  readonly type = 'Select' as const;
  declare this_: undefined; // Select doesn't use 'this'

  // Typed arg accessors
  get from_(): From | undefined { return this._args.from as From | undefined; }
  get joins(): Join[] { return this._args.joins ?? []; }
  get where(): Where | undefined { return this._args.where as Where | undefined; }
  // ... etc for all 33 args

  // Builder methods (return this for chaining)
  select(...expressions: (string | Expression)[]): this;
  from_(table: string | Expression): this;
  where(condition: string | Expression): this;
  join(table: string | Expression, opts?: JoinOpts): this;
  limit(n: number | Expression): this;
  orderBy(...expressions: (string | Expression)[]): this;
}

class Column extends Condition {
  readonly type = 'Column' as const;
  declare this_: Identifier;

  get table(): string { return this.text('table'); }
  get db(): string { return this.text('db'); }
  get catalog(): string { return this.text('catalog'); }
  get parts(): Identifier[];
}

// Multiple inheritance via interfaces
interface Predicate {}
class GT extends Binary implements Predicate {
  readonly type = 'GT' as const;
}
```

### Property accessor convention

- Python's `self.this` → TS `this.this_` (trailing underscore avoids keyword collision)
- Python's `self.args["from"]` → TS `this.from_` (same underscore convention for reserved words)
- Python's `self.args.get("where")` → TS property getter with `| undefined` return

### File structure

```
sqlglot-ts/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tsdown.config.ts
├── vitest.config.ts
├── SPEC.md                        # This file
│
├── src/
│   ├── index.ts                   # Main entry: parse, parseOne, transpile
│   ├── tokens.ts                  # TokenType enum, Token class
│   ├── tokenizer.ts               # Tokenizer class
│   ├── parser.ts                  # Parser class
│   ├── generator.ts               # Generator class
│   ├── expressions.ts             # All Expression subclasses (codegen'd)
│   ├── errors.ts                  # Error types (ParseError, TokenError, etc.)
│   ├── schema.ts                  # Schema classes (MappingSchema, etc.)
│   ├── lineage.ts                 # Column-level lineage
│   ├── helper.ts                  # Utility functions
│   ├── trie.ts                    # Trie for keyword matching
│   ├── dialects/
│   │   ├── index.ts               # Dialect base class + registry
│   │   ├── dialect.ts             # Base Dialect class
│   │   ├── postgres.ts            # PostgreSQL dialect
│   │   └── mysql.ts               # MySQL dialect
│   └── types.ts                   # Shared TS types, utility types
│
├── tests/
│   ├── test_expressions.test.ts
│   ├── test_parser.test.ts
│   ├── test_generator.test.ts
│   ├── test_tokenizer.test.ts
│   ├── test_lineage.test.ts
│   ├── test_helper.test.ts
│   ├── helpers.ts                 # Test utilities
│   ├── fixtures/                  # Test fixtures (copied from Python)
│   └── dialects/
│       ├── test_postgres.test.ts
│       └── test_mysql.test.ts
│
├── scripts/
│   ├── codegen_expressions.py     # Generates expressions.ts from Python
│   └── codegen_tests.py           # Converts Python tests to vitest
│
└── dist/                          # Build output (gitignored)
```

### Entry points

| Entry point | Import path | Contents |
|-------------|-------------|----------|
| Main | `sqlglot-ts` | `parse`, `parseOne`, `transpile`, all expressions, base dialect |
| PostgreSQL | `sqlglot-ts/dialects/postgres` | PostgreSQL dialect |
| MySQL | `sqlglot-ts/dialects/mysql` | MySQL dialect |

All dialects are also re-exported from the main entry point.

## Tooling

| Tool | Purpose | Config |
|------|---------|--------|
| **pnpm** | Package manager | `package.json` |
| **TypeScript** | Language, strict mode | `tsconfig.json` |
| **tsdown** | Build/bundle (ESM-only) | `tsdown.config.ts` |
| **vitest** | Test runner | `vitest.config.ts` |
| **biome** | Lint + format (fast, zero-config) | `biome.json` |

### TypeScript config

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### Package output (ESM-only)

```jsonc
{
  "name": "sqlglot-ts",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./dialects/postgres": {
      "types": "./dist/dialects/postgres.d.ts",
      "import": "./dist/dialects/postgres.js"
    },
    "./dialects/mysql": {
      "types": "./dist/dialects/mysql.d.ts",
      "import": "./dist/dialects/mysql.js"
    }
  }
}
```

## Browser Compatibility

- **No Node.js APIs** — no `fs`, `path`, `Buffer`, etc. in core library code
- **No dependencies** — zero runtime dependencies (mirrors Python's "no-dependency" philosophy)
- **ES2022 target** — supported by all modern browsers (Chrome 94+, Firefox 93+, Safari 16.4+)
- **Pure ESM** — native `<script type="module">` support

## Codegen

### `scripts/codegen_expressions.py`

Reads `sqlglot/expressions.py` by importing sqlglot and introspecting the class hierarchy. Outputs `src/expressions.ts` containing:

1. All Expression subclasses with correct inheritance
2. Typed `arg_types` as TS interfaces (required args non-optional, optional args with `?`)
3. Property getters for each arg
4. `readonly type` discriminant on each class
5. Interfaces for multiple-inheritance traits (Predicate, UDTF, IntervalOp, etc.)
6. Constructor accepting typed args
7. Static `argTypes` metadata (mirrors Python's `arg_types` dict for runtime introspection)

### `scripts/codegen_tests.py`

Converts Python unittest test files to vitest format:

- `self.validate_identity(sql)` → `validateIdentity(sql)`
- `self.validate_all(sql, read={...}, write={...})` → `validateAll(sql, { read: {...}, write: {...} })`
- `self.assertEqual(a, b)` → `expect(a).toBe(b)` / `expect(a).toEqual(b)`
- `self.assertIsInstance(a, T)` → `expect(a).toBeInstanceOf(T)`
- Python string handling → TS template literals / regular strings
- Skips tests for dialects not yet ported (marks as `test.todo`)

## API Design

### Top-level functions (mirrors Python)

```typescript
// Parse SQL string into AST
function parse(sql: string, opts?: { dialect?: string }): Expression[];

// Parse single SQL statement
function parseOne(sql: string, opts?: { dialect?: string }): Expression;

// Transpile between dialects
function transpile(
  sql: string,
  opts?: {
    read?: string;
    write?: string;
    pretty?: boolean;
  }
): string[];

// Build SQL programmatically
function select(...expressions: (string | Expression)[]): Select;
function from_(table: string | Expression): Select;
function condition(sql: string, opts?: { dialect?: string }): Expression;
```

### Expression builder methods

```typescript
// Fluent API mirrors Python
select("a", "b")
  .from_("table")
  .where("x = 1")
  .orderBy("a")
  .limit(10)
  .sql({ dialect: "postgres", pretty: true });
```

### Naming conventions

| Python | TypeScript | Reason |
|--------|-----------|--------|
| `snake_case` methods | `camelCase` methods | TS convention |
| `self.this` | `this.this_` | `this` is reserved |
| `self.args["from"]` | `this.from_` | `from` is reserved |
| `exp.Select` | `exp.Select` | Same class names |
| `TokenType.L_PAREN` | `TokenType.LParen` | TS enum convention |
| `parse_one()` | `parseOne()` | camelCase |
| `_parse_select()` | `private parseSelect()` | TS access modifier |
| `KEYWORDS` dict | `static readonly KEYWORDS: Map<string, TokenType>` | Typed map |

## Testing

### Framework: Vitest

- Fast, ESM-native, good TypeScript support
- Browser mode available for browser-specific testing later

### Test helpers (port from `tests/helpers.py`)

```typescript
// Core test utilities
function validateIdentity(
  sql: string,
  opts?: { dialect?: string; pretty?: boolean }
): Expression;

function validateAll(
  sql: string,
  opts: {
    read?: Record<string, string>;
    write?: Record<string, string>;
  }
): void;

function parseAndCompare(
  sql: string,
  expected: string,
  opts?: { readDialect?: string; writeDialect?: string }
): void;
```

### Test scope

| Test file (Python) | Test file (TS) | Priority |
|----|-----|-----|
| `test_expressions.py` | `test_expressions.test.ts` | P0 |
| `test_parser.py` (removed) | (skip) | - |
| `test_helper.py` | `test_helper.test.ts` | P0 |
| `test_tokens.py` | `test_tokenizer.test.ts` | P0 |
| `dialects/test_postgres.py` | `dialects/test_postgres.test.ts` | P0 |
| `dialects/test_mysql.py` | `dialects/test_mysql.test.ts` | P0 |
| `test_lineage.py` | `test_lineage.test.ts` | P1 |
| `test_build.py` | `test_build.test.ts` | P1 |
| All other dialect tests | `*.test.ts` (as `test.todo`) | P2 |

## Key Design Decisions

1. **No dependencies** — zero runtime deps, dev deps only for build/test
2. **Browser-first** — no Node.js APIs in library code
3. **ESM-only** — no CommonJS output
4. **Strict TypeScript** — `strict: true`, `noUncheckedIndexedAccess: true`
5. **Codegen expressions** — Python script generates the ~850+ Expression classes
6. **Codegen tests** — Python script converts unittest → vitest
7. **Property accessors over raw dict** — typed getters are the API, `_args` dict is internal
8. **Hybrid AST** — class hierarchy + discriminant for type narrowing
9. **camelCase API** — TS conventions, but same class/concept names as Python
10. **Monorepo subfolder** — lives at `sqlglot/sqlglot-ts/`

## Implementation Order

### Phase 1: Project scaffolding
- Initialize pnpm project, tsconfig, tsdown, vitest, biome
- Set up build pipeline and verify it works
- Create directory structure

### Phase 2: Codegen pipeline
- Write `codegen_expressions.py` — generate all Expression classes
- Write `codegen_tests.py` — convert Python tests to vitest
- Run both, verify output compiles

### Phase 3: Core pipeline (tokenizer → parser → generator)
- Port `tokens.ts` (TokenType enum, Token class)
- Port `trie.ts` (keyword trie)
- Port `helper.ts` (utility functions)
- Port `errors.ts` (error types)
- Port `tokenizer.ts`
- Port `parser.ts` (largest file — recursive descent)
- Port `generator.ts`

### Phase 4: Dialect base + PostgreSQL + MySQL
- Port `dialects/dialect.ts` (base Dialect class, registry)
- Port `dialects/postgres.ts`
- Port `dialects/mysql.ts`

### Phase 5: Top-level API + lineage
- Wire up `parse`, `parseOne`, `transpile`, builder functions
- Port `schema.ts`
- Port `lineage.ts`

### Phase 6: Test green
- Run codegen'd tests, fix failures
- Ensure all P0 tests pass
- Add browser smoke test (e.g., via vitest browser mode or simple HTML page)
