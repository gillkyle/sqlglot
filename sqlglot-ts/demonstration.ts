/**
 * sqlglot-ts Demonstration Script
 *
 * Run with: npx tsx demonstration.ts
 *
 * Showcases the full feature set of sqlglot-ts:
 *  - Parsing SQL into a typed AST
 *  - Generating SQL from AST nodes
 *  - Transpiling between SQL dialects
 *  - Fluent query builder API
 *  - AST traversal with find / findAll / walk
 *  - AST transformation
 *  - Pretty printing
 *  - Error handling
 */

import {
  parse,
  parseOne,
  transpile,
  // Builder helpers
  select,
  from_,
  condition,
  and_,
  or_,
  not_,
  column,
  cast,
  // AST node types (fully typed)
  Select,
  Column,
  Literal,
  Table,
  Identifier,
  Where,
  EQ,
  Star,
  Alias,
  Case,
  Ordered,
  maybeParse,
  // Errors
  ParseError,
} from "./src/index.ts";

// ─── Helpers ────────────────────────────────────────────────────────────────

function section(title: string) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(70)}\n`);
}

function demo(label: string, value: unknown) {
  console.log(`  ${label}`);
  console.log(`    => ${value}\n`);
}

// ─── 1. Parsing ─────────────────────────────────────────────────────────────

section("1. Parsing SQL into a Typed AST");

const tree = parseOne("SELECT a, b + 1 AS c FROM users WHERE active = 1");
demo("parseOne returns a typed AST node", tree.constructor.name);
demo("Round-trip back to SQL", tree.sql());

// parse() handles multiple statements
const multi = parse("SELECT 1; SELECT 2; SELECT 3");
demo(`parse() returns ${multi.length} expressions for 3 statements`, multi.map((e) => e!.sql()));

// The AST is fully typed - you can narrow with instanceof
const sel = tree as Select;
demo("instanceof Select", sel instanceof Select);

// ─── 2. Typed AST Nodes ────────────────────────────────────────────────────

section("2. Exploring the Typed AST");

const query = parseOne("SELECT u.name, COUNT(*) AS total FROM users u GROUP BY u.name");

// find() returns the first match of a given type
const firstCol = query.find(Column);
demo("find(Column) -> first column node", firstCol?.sql());
demo("column .name property", firstCol?.name);

// findAll() returns all matches
const allColumns = [...query.findAll(Column)];
demo(
  "findAll(Column) -> all column nodes",
  allColumns.map((c) => c.sql()),
);

// find specific node types
const table = query.find(Table);
demo("find(Table)", table?.sql());

const alias = query.find(Alias);
demo("find(Alias)", alias?.sql());

// ─── 3. Transpilation Between Dialects ──────────────────────────────────────

section("3. Transpiling Between SQL Dialects");

// Type mappings change between dialects
demo(
  "Postgres TEXT -> BigQuery STRING",
  transpile("SELECT CAST(x AS TEXT)", { readDialect: "postgres", writeDialect: "bigquery" })[0],
);

demo(
  "Postgres TEXT -> Snowflake VARCHAR",
  transpile("SELECT CAST(x AS TEXT)", { readDialect: "postgres", writeDialect: "snowflake" })[0],
);

demo(
  "Postgres INT -> BigQuery INT64",
  transpile("SELECT CAST(x AS INT)", { readDialect: "postgres", writeDialect: "bigquery" })[0],
);

// Identifier quoting conventions
demo(
  "MySQL backticks -> Postgres double-quotes",
  transpile("SELECT `user_name` FROM `my_db`.`users`", {
    readDialect: "mysql",
    writeDialect: "postgres",
  })[0],
);

demo(
  "Postgres double-quotes -> MySQL backticks",
  transpile('SELECT "user_name" FROM "users"', {
    readDialect: "postgres",
    writeDialect: "mysql",
  })[0],
);

// ILIKE is Postgres-specific, gets lowered to LIKE elsewhere
demo(
  "Postgres ILIKE -> MySQL LIKE",
  transpile("SELECT * FROM t WHERE name ILIKE '%foo%'", {
    readDialect: "postgres",
    writeDialect: "mysql",
  })[0],
);

// ─── 4. Fluent Query Builder ────────────────────────────────────────────────

section("4. Fluent Query Builder API");

// Build queries programmatically with full type safety
const built = select("u.name", "u.email", "COUNT(*) AS order_count")
  .from_("users u")
  .join("orders o", { on: "u.id = o.user_id" })
  .where("u.active = 1")
  .where("o.created_at > '2024-01-01'")
  .groupBy("u.name", "u.email")
  .having("COUNT(*) > 5")
  .orderBy("order_count")
  .limit(100);

demo("Fluent builder SQL", built.sql());

// from_() starts with the FROM clause
demo(
  "from_() starting point",
  from_("events").select("event_type", "COUNT(*) AS cnt").groupBy("event_type").sql(),
);

// Condition builders with and_ / or_ / not_
demo(
  "and_(cond, cond)",
  and_("status = 'active'", "age > 18").sql(),
);

demo(
  "or_(and_(...), and_(...))",
  or_(and_("a = 1", "b = 2"), and_("c = 3", "d = 4")).sql(),
);

demo(
  "not_(condition)",
  not_("deleted = 1").sql(),
);

// Chaining conditions
demo(
  "condition().and_().or_()",
  condition("x > 0").and_("y > 0").or_("z = 1").sql(),
);

// column() and cast() helpers
demo("column('id', 'users')", column("id", "users").sql());
demo("column('id', 'users', 'mydb')", column("id", "users", "mydb").sql());
demo("cast('price', 'DECIMAL')", cast("price", "DECIMAL").sql());

// CASE expression builder
demo(
  "Case().when().when().else_()",
  new Case({}).when("status = 1", "'active'").when("status = 0", "'inactive'").else_("'unknown'").sql(),
);

// Subqueries
demo(
  "Subquery with alias",
  select("*").from_(select("id", "name").from_("users").subquery("u")).sql(),
);

// ─── 5. AST Traversal ──────────────────────────────────────────────────────

section("5. AST Traversal");

const complex = parseOne(
  "SELECT a, b + 1 AS result, CAST(c AS TEXT) FROM t WHERE x = 1 AND y > 2",
);

// walk() does a breadth-first traversal by default
const nodeTypes: string[] = [];
for (const node of complex.walk()) {
  nodeTypes.push(node.constructor.name);
}
demo(`walk() visits ${nodeTypes.length} AST nodes`, nodeTypes.slice(0, 12).join(", ") + ", ...");

// Count specific node types
const literalCount = [...complex.findAll(Literal)].length;
const columnCount = [...complex.findAll(Column)].length;
demo(`Literals in AST: ${literalCount}, Columns: ${columnCount}`, "");

// ─── 6. AST Transformation ─────────────────────────────────────────────────

section("6. AST Transformation");

const original = parseOne("SELECT user_name, user_email FROM users WHERE user_id = 1");
demo("Original", original.sql());

// Rename all columns: user_* -> *
const renamed = original.transform((node) => {
  if (node instanceof Column && node.name.startsWith("user_")) {
    const newName = node.name.slice(5); // strip "user_"
    return column(newName, node.table);
  }
  return node;
});
demo("Transformed (strip 'user_' prefix)", renamed.sql());

// Replace a column with a literal
const replaced = parseOne("SELECT price, quantity FROM orders").transform((node) => {
  if (node instanceof Column && node.name === "price") {
    return Literal.number(99);
  }
  return node;
});
demo("Replace column with literal", replaced.sql());

// ─── 7. Pretty Printing ────────────────────────────────────────────────────

section("7. Pretty Printing");

const prettyQuery = select("u.name", "u.email", "o.total")
  .from_("users u")
  .join("orders o", { on: "u.id = o.user_id" })
  .where("o.total > 100")
  .where("u.active = 1")
  .orderBy("o.total")
  .limit(50);

demo("Pretty printed SQL:\n" + prettyQuery.sql({ pretty: true }), "");

// Pretty print a transpiled query
const prettyTranspiled = transpile(
  "SELECT CAST(x AS TEXT), CAST(y AS INT) FROM t WHERE z > 0 ORDER BY x LIMIT 10",
  { readDialect: "postgres", writeDialect: "bigquery", pretty: true },
);
demo("Pretty transpiled (Postgres -> BigQuery):\n" + prettyTranspiled[0], "");

// ─── 8. Copy and Equality ───────────────────────────────────────────────────

section("8. Copy and Equality");

const expr = parseOne("SELECT a, b FROM t");
const copy = expr.copy();

demo("Original SQL", expr.sql());
demo("Copy SQL", copy.sql());
demo("Structural equality (eq)", expr.eq(copy));

// Copies are independent - modifying one doesn't affect the other
const modified = (copy as Select).where("x > 0");
demo("Modified copy", modified.sql());
demo("Original unchanged", expr.sql());

// ─── 9. Error Handling ──────────────────────────────────────────────────────

section("9. Error Handling");

try {
  parseOne("SELEC broken stuff !!!");
} catch (err) {
  if (err instanceof ParseError) {
    demo("ParseError caught", err.message.split("\n")[0]);
    demo("Error details", JSON.stringify(err.errors[0], null, 2));
  }
}

try {
  parseOne("SELECT (((");
} catch (err) {
  if (err instanceof ParseError) {
    demo("ParseError for mismatched parens", err.message.split("\n")[0]);
  }
}

try {
  parseOne("SELECT 1; SELECT 2");
} catch (err) {
  demo("Multiple statements in parseOne()", (err as Error).message);
}

// ─── 10. Putting It All Together ────────────────────────────────────────────

section("10. End-to-End: Parse, Transform, Transpile");

// Parse a Postgres query
const pgQuery = parseOne(
  "SELECT name, CAST(age AS TEXT) FROM users WHERE active = 1 ORDER BY name LIMIT 10",
  { dialect: "postgres" },
);
demo("Step 1 - Parse Postgres SQL", pgQuery.sql());

// Transform it: add a column
const withExtra = (pgQuery as Select).select("email");
demo("Step 2 - Add 'email' column via builder", withExtra.sql());

// Generate for multiple target dialects
const targets = ["postgres", "mysql", "bigquery", "snowflake", "duckdb"] as const;
for (const dialect of targets) {
  demo(`Step 3 - Generate for ${dialect}`, withExtra.sql({ dialect }));
}

console.log("\n" + "=".repeat(70));
console.log("  Demo complete!");
console.log("=".repeat(70) + "\n");
