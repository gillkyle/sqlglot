# sqlglot-ts

A no-dependency SQL parser, transpiler, and AST toolkit for TypeScript -- a faithful port of the Python [sqlglot](https://github.com/tobymao/sqlglot) library that runs in the browser and Node.js.

## Features

- Zero runtime dependencies
- Browser-compatible (no Node.js APIs required)
- Parses SQL into a fully typed AST
- Generates SQL from AST nodes
- Transpiles SQL between dialects
- Fluent builder API for constructing SQL programmatically
- ESM-only, ES2022 target
- Strict TypeScript with full type inference

## Install

```bash
pnpm add sqlglot-ts
# or
npm install sqlglot-ts
# or
yarn add sqlglot-ts
```

## Quick Start

### Parse SQL to AST

```typescript
import { parseOne } from "sqlglot-ts";

const tree = parseOne("SELECT a, b FROM t WHERE x = 1");
console.log(tree.sql()); // "SELECT a, b FROM t WHERE x = 1"
```

### Generate SQL with options

```typescript
const tree = parseOne("SELECT a FROM t");
console.log(tree.sql({ pretty: true }));
```

### Transpile between dialects

```typescript
import { transpile } from "sqlglot-ts";

const results = transpile("SELECT NOW()", {
  readDialect: "postgres",
  writeDialect: "mysql",
});
console.log(results[0]);
```

## API Reference

### Top-level functions

#### `parse(sql, opts?)`

Parse a SQL string into an array of AST expressions (one per statement).

```typescript
import { parse } from "sqlglot-ts";

const expressions = parse("SELECT 1; SELECT 2");
// returns [Expression, Expression]
```

Options:
- `dialect?: string` -- source dialect (default: base sqlglot dialect)

#### `parseOne(sql, opts?)`

Parse a SQL string containing exactly one statement. Throws if zero or multiple statements are found.

```typescript
import { parseOne } from "sqlglot-ts";

const tree = parseOne("SELECT 1");
```

Options:
- `dialect?: string` -- source dialect

#### `transpile(sql, opts?)`

Parse and regenerate SQL, optionally converting between dialects. Returns an array of SQL strings (one per statement).

```typescript
import { transpile } from "sqlglot-ts";

const result = transpile("SELECT 1", {
  readDialect: "postgres",
  writeDialect: "mysql",
  pretty: true,
});
```

Options:
- `readDialect?: string` -- source dialect
- `writeDialect?: string` -- target dialect
- `pretty?: boolean` -- enable pretty printing

### Builder functions

All builder functions are exported from the main entry point.

#### `select(...expressions)`

Create a `SELECT` statement.

```typescript
import { select } from "sqlglot-ts";

select("a", "b").from_("t").sql();
// "SELECT a, b FROM t"
```

#### `from_(table)`

Create a `SELECT` starting from a `FROM` clause.

```typescript
import { from_ } from "sqlglot-ts";

from_("t").select("a", "b").sql();
// "SELECT a, b FROM t"
```

#### `condition(sql, opts?)`

Parse a SQL string as a boolean condition.

```typescript
import { condition } from "sqlglot-ts";

const cond = condition("x > 1");
```

#### `and_(...expressions)`, `or_(...expressions)`, `not_(expression)`

Combine conditions with logical operators.

```typescript
import { and_, or_, not_, condition } from "sqlglot-ts";

and_(condition("x = 1"), condition("y = 2")).sql();
// "x = 1 AND y = 2"
```

#### `column(col, table?, db?, catalog?)`

Build a `Column` expression.

```typescript
import { column } from "sqlglot-ts";

column("id", "users").sql();
// "users.id"
```

#### `cast(expression, to)`

Build a `CAST` expression.

```typescript
import { cast } from "sqlglot-ts";

cast("x", "INT").sql();
// "CAST(x AS INT)"
```

## Working with the AST

### Finding nodes

Use `find()` and `findAll()` to locate nodes by type.

```typescript
import { parseOne, Column } from "sqlglot-ts";

const tree = parseOne("SELECT a, b + 1 AS c FROM d");

for (const col of tree.findAll(Column)) {
  console.log(col.name);
}
// "a", "b"
```

### Transforming the AST

Use `transform()` to rewrite nodes. Return a new node to replace, or the same node to keep it.

```typescript
import { parseOne, Column, Literal } from "sqlglot-ts";

const tree = parseOne("SELECT a, b FROM t");

const transformed = tree.transform((node) => {
  if (node instanceof Column && node.name === "a") {
    return Literal.number(1);
  }
  return node;
});

console.log(transformed.sql());
// "SELECT 1, b FROM t"
```

### Building SQL programmatically

The `Select` class supports a fluent builder API.

```typescript
import { select, condition } from "sqlglot-ts";

const query = select("a", "b")
  .from_("users")
  .where("active = 1")
  .where("role = 'admin'")
  .orderBy("a")
  .limit(10)
  .sql({ pretty: true });
```

### Traversing the AST

Use `walk()` for depth-first traversal, or pass `true` for breadth-first.

```typescript
const tree = parseOne("SELECT a FROM t WHERE x = 1");

for (const node of tree.walk()) {
  console.log(node.constructor.name);
}
```

## Browser Usage

sqlglot-ts is ESM-only and uses no Node.js APIs, so it works directly in the browser.

```html
<script type="module">
  import { parseOne } from "https://esm.sh/sqlglot-ts";

  const tree = parseOne("SELECT 1 + 2 AS result");
  document.body.textContent = tree.sql();
</script>
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Type-check without emitting
pnpm run typecheck

# Build
pnpm run build
```

## Project Status

sqlglot-ts is an early-stage port of the Python sqlglot library. The following is a summary of what is currently available and what is planned.

### Working

- Full tokenizer
- Recursive descent parser (base dialect)
- SQL generator with pretty printing
- 850+ Expression AST node types
- Fluent query builder API
- Top-level `parse`, `parseOne`, `transpile` functions

### In progress

- PostgreSQL dialect
- MySQL dialect
- Column-level lineage tracing

### Not yet ported

- Optimizer (qualify, simplify, type annotation, pushdown)
- In-memory SQL engine
- Additional dialects (Snowflake, DuckDB, BigQuery, Spark, etc.)
