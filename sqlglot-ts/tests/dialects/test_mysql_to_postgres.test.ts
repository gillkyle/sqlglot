import { describe, it, expect } from "vitest";
import { transpile } from "../../src/index.js";

/**
 * Validate MySQL → Postgres transpilation.
 */
function mysqlToPostgres(sql: string, expected: string): void {
  const result = transpile(sql, {
    readDialect: "mysql",
    writeDialect: "postgres",
  })[0];
  expect(result).toBe(expected);
}

/**
 * Validate Postgres → MySQL transpilation.
 */
function postgresToMysql(sql: string, expected: string): void {
  const result = transpile(sql, {
    readDialect: "postgres",
    writeDialect: "mysql",
  })[0];
  expect(result).toBe(expected);
}

// =============================================================================
// Identifier Quoting: backticks (MySQL) ↔ double-quotes (Postgres)
// =============================================================================

describe("MySQL→Postgres: identifier quoting", () => {
  it("converts backtick identifiers to double-quotes", () => {
    mysqlToPostgres(
      "SELECT `a` FROM `b`",
      'SELECT "a" FROM "b"',
    );
  });

  it("converts backtick table.column to double-quotes", () => {
    mysqlToPostgres(
      "SELECT `t`.`col` FROM `t`",
      'SELECT "t"."col" FROM "t"',
    );
  });

  it("unquoted identifiers pass through", () => {
    mysqlToPostgres(
      "SELECT a FROM b",
      "SELECT a FROM b",
    );
  });

  it("backtick-quoted alias", () => {
    mysqlToPostgres(
      "SELECT 1 AS `my alias`",
      'SELECT 1 AS "my alias"',
    );
  });
});

describe("Postgres→MySQL: identifier quoting", () => {
  it("converts double-quote identifiers to backticks", () => {
    postgresToMysql(
      'SELECT "a" FROM "b"',
      "SELECT `a` FROM `b`",
    );
  });
});

// =============================================================================
// Type Mappings
// =============================================================================

describe("MySQL→Postgres: type mappings in CAST", () => {
  it("SIGNED → BIGINT", () => {
    mysqlToPostgres(
      "SELECT CAST(x AS SIGNED)",
      "SELECT CAST(x AS BIGINT)",
    );
  });

  it("FLOAT → DOUBLE PRECISION", () => {
    mysqlToPostgres(
      "SELECT CAST(x AS FLOAT)",
      "SELECT CAST(x AS DOUBLE PRECISION)",
    );
  });

  it("DOUBLE → DOUBLE PRECISION", () => {
    mysqlToPostgres(
      "SELECT CAST(x AS DOUBLE)",
      "SELECT CAST(x AS DOUBLE PRECISION)",
    );
  });

  it("BINARY → BYTEA", () => {
    mysqlToPostgres(
      "SELECT CAST(x AS BINARY)",
      "SELECT CAST(x AS BYTEA)",
    );
  });

  it("DATETIME → TIMESTAMP", () => {
    mysqlToPostgres(
      "SELECT CAST(x AS DATETIME)",
      "SELECT CAST(x AS TIMESTAMP)",
    );
  });

  it("preserves DECIMAL with precision", () => {
    mysqlToPostgres(
      "SELECT CAST(x AS DECIMAL(10, 2))",
      "SELECT CAST(x AS DECIMAL(10, 2))",
    );
  });

  it("preserves VARCHAR with length", () => {
    mysqlToPostgres(
      "SELECT CAST(x AS CHAR(50))",
      "SELECT CAST(x AS CHAR(50))",
    );
  });
});

// =============================================================================
// ILIKE handling
// =============================================================================

describe("MySQL→Postgres: LIKE/ILIKE", () => {
  it("LIKE passes through", () => {
    mysqlToPostgres(
      "SELECT * FROM t WHERE name LIKE '%foo%'",
      "SELECT * FROM t WHERE name LIKE '%foo%'",
    );
  });
});

describe("Postgres→MySQL: ILIKE → LIKE", () => {
  it("ILIKE converted to LIKE for MySQL", () => {
    postgresToMysql(
      "SELECT * FROM t WHERE name ILIKE '%foo%'",
      "SELECT * FROM t WHERE name LIKE '%foo%'",
    );
  });
});

// =============================================================================
// Basic Queries
// =============================================================================

describe("MySQL→Postgres: basic queries", () => {
  it("simple SELECT", () => {
    mysqlToPostgres(
      "SELECT 1",
      "SELECT 1",
    );
  });

  it("SELECT with WHERE", () => {
    mysqlToPostgres(
      "SELECT a FROM t WHERE a > 1",
      "SELECT a FROM t WHERE a > 1",
    );
  });

  it("SELECT with multiple conditions", () => {
    mysqlToPostgres(
      "SELECT a FROM t WHERE a > 1 AND b = 'hello'",
      "SELECT a FROM t WHERE a > 1 AND b = 'hello'",
    );
  });

  it("SELECT with ORDER BY and LIMIT", () => {
    mysqlToPostgres(
      "SELECT a FROM t ORDER BY a DESC LIMIT 10",
      "SELECT a FROM t ORDER BY a DESC LIMIT 10",
    );
  });

  it("SELECT with GROUP BY and HAVING", () => {
    mysqlToPostgres(
      "SELECT a, COUNT(*) FROM t GROUP BY a HAVING COUNT(*) > 1",
      "SELECT a, COUNT(*) FROM t GROUP BY a HAVING COUNT(*) > 1",
    );
  });

  it("SELECT DISTINCT", () => {
    mysqlToPostgres(
      "SELECT DISTINCT a FROM t",
      "SELECT DISTINCT a FROM t",
    );
  });
});

// =============================================================================
// JOINs
// =============================================================================

describe("MySQL→Postgres: JOINs", () => {
  it("INNER JOIN", () => {
    mysqlToPostgres(
      "SELECT a FROM t1 INNER JOIN t2 ON t1.id = t2.id",
      "SELECT a FROM t1 INNER JOIN t2 ON t1.id = t2.id",
    );
  });

  it("LEFT JOIN", () => {
    mysqlToPostgres(
      "SELECT a FROM t1 LEFT JOIN t2 ON t1.id = t2.id",
      "SELECT a FROM t1 LEFT JOIN t2 ON t1.id = t2.id",
    );
  });

  it("RIGHT JOIN", () => {
    mysqlToPostgres(
      "SELECT a FROM t1 RIGHT JOIN t2 ON t1.id = t2.id",
      "SELECT a FROM t1 RIGHT JOIN t2 ON t1.id = t2.id",
    );
  });

  it("CROSS JOIN", () => {
    mysqlToPostgres(
      "SELECT a FROM t1 CROSS JOIN t2",
      "SELECT a FROM t1 CROSS JOIN t2",
    );
  });

  it("multi-table JOIN with backticks", () => {
    mysqlToPostgres(
      "SELECT `u`.`name`, `o`.`total` FROM `users` AS `u` JOIN `orders` AS `o` ON `u`.`id` = `o`.`user_id`",
      'SELECT "u"."name", "o"."total" FROM "users" AS "u" JOIN "orders" AS "o" ON "u"."id" = "o"."user_id"',
    );
  });
});

// =============================================================================
// Subqueries & CTEs
// =============================================================================

describe("MySQL→Postgres: subqueries and CTEs", () => {
  it("subquery in WHERE", () => {
    mysqlToPostgres(
      "SELECT a FROM t WHERE a IN (SELECT b FROM t2)",
      "SELECT a FROM t WHERE a IN (SELECT b FROM t2)",
    );
  });

  it("subquery in FROM", () => {
    mysqlToPostgres(
      "SELECT x FROM (SELECT a AS x FROM t) AS sub",
      "SELECT x FROM (SELECT a AS x FROM t) AS sub",
    );
  });

  it("CTE (WITH clause)", () => {
    mysqlToPostgres(
      "WITH cte AS (SELECT a FROM t) SELECT * FROM cte",
      "WITH cte AS (SELECT a FROM t) SELECT * FROM cte",
    );
  });
});

// =============================================================================
// Aggregate Functions
// =============================================================================

describe("MySQL→Postgres: aggregate functions", () => {
  it("COUNT", () => {
    mysqlToPostgres("SELECT COUNT(*) FROM t", "SELECT COUNT(*) FROM t");
  });

  it("SUM", () => {
    mysqlToPostgres("SELECT SUM(a) FROM t", "SELECT SUM(a) FROM t");
  });

  it("AVG", () => {
    mysqlToPostgres("SELECT AVG(a) FROM t", "SELECT AVG(a) FROM t");
  });

  it("MIN and MAX", () => {
    mysqlToPostgres("SELECT MIN(a), MAX(a) FROM t", "SELECT MIN(a), MAX(a) FROM t");
  });
});

// =============================================================================
// CASE WHEN
// =============================================================================

describe("MySQL→Postgres: CASE WHEN", () => {
  it("simple CASE WHEN", () => {
    mysqlToPostgres(
      "SELECT CASE WHEN a > 1 THEN 'big' ELSE 'small' END FROM t",
      "SELECT CASE WHEN a > 1 THEN 'big' ELSE 'small' END FROM t",
    );
  });

  it("CASE WHEN with multiple conditions", () => {
    mysqlToPostgres(
      "SELECT CASE WHEN a = 1 THEN 'one' WHEN a = 2 THEN 'two' ELSE 'other' END FROM t",
      "SELECT CASE WHEN a = 1 THEN 'one' WHEN a = 2 THEN 'two' ELSE 'other' END FROM t",
    );
  });
});

// =============================================================================
// Set Operations
// =============================================================================

describe("MySQL→Postgres: set operations", () => {
  it("UNION", () => {
    mysqlToPostgres(
      "SELECT a FROM t1 UNION SELECT b FROM t2",
      "SELECT a FROM t1 UNION SELECT b FROM t2",
    );
  });

  it("UNION ALL", () => {
    mysqlToPostgres(
      "SELECT a FROM t1 UNION ALL SELECT b FROM t2",
      "SELECT a FROM t1 UNION ALL SELECT b FROM t2",
    );
  });
});

// =============================================================================
// String Functions
// =============================================================================

describe("MySQL→Postgres: string functions", () => {
  it("CONCAT", () => {
    mysqlToPostgres(
      "SELECT CONCAT(a, b) FROM t",
      "SELECT CONCAT(a, b) FROM t",
    );
  });

  it("UPPER and LOWER", () => {
    mysqlToPostgres(
      "SELECT UPPER(a), LOWER(a) FROM t",
      "SELECT UPPER(a), LOWER(a) FROM t",
    );
  });

  it("TRIM", () => {
    mysqlToPostgres(
      "SELECT TRIM(a) FROM t",
      "SELECT TRIM(a) FROM t",
    );
  });

  it("COALESCE", () => {
    mysqlToPostgres(
      "SELECT COALESCE(a, b, 'default') FROM t",
      "SELECT COALESCE(a, b, 'default') FROM t",
    );
  });
});

// =============================================================================
// NULL handling
// =============================================================================

describe("MySQL→Postgres: NULL handling", () => {
  it("IS NULL", () => {
    mysqlToPostgres(
      "SELECT a FROM t WHERE a IS NULL",
      "SELECT a FROM t WHERE a IS NULL",
    );
  });

  it("IS NOT NULL", () => {
    mysqlToPostgres(
      "SELECT a FROM t WHERE a IS NOT NULL",
      "SELECT a FROM t WHERE a IS NOT NULL",
    );
  });

  it("NULLIF", () => {
    mysqlToPostgres(
      "SELECT NULLIF(a, 0) FROM t",
      "SELECT NULLIF(a, 0) FROM t",
    );
  });
});

// =============================================================================
// Playground-style queries (what a user might type)
// =============================================================================

describe("MySQL→Postgres: playground-style queries", () => {
  it("users JOIN orders with backticks", () => {
    mysqlToPostgres(
      "SELECT `users`.`name`, `orders`.`total` FROM `users` JOIN `orders` ON `users`.`id` = `orders`.`user_id` WHERE `orders`.`total` > 100 ORDER BY `orders`.`total` DESC",
      'SELECT "users"."name", "orders"."total" FROM "users" JOIN "orders" ON "users"."id" = "orders"."user_id" WHERE "orders"."total" > 100 ORDER BY "orders"."total" DESC',
    );
  });

  it("aggregate with GROUP BY", () => {
    mysqlToPostgres(
      "SELECT `users`.`name`, SUM(`orders`.`total`) AS `total_spent` FROM `users` JOIN `orders` ON `users`.`id` = `orders`.`user_id` GROUP BY `users`.`name` ORDER BY `total_spent` DESC",
      'SELECT "users"."name", SUM("orders"."total") AS "total_spent" FROM "users" JOIN "orders" ON "users"."id" = "orders"."user_id" GROUP BY "users"."name" ORDER BY "total_spent" DESC',
    );
  });

  it("subquery with alias", () => {
    mysqlToPostgres(
      "SELECT `name`, `email` FROM `users` WHERE `id` IN (SELECT `user_id` FROM `orders` WHERE `status` = 'completed')",
      'SELECT "name", "email" FROM "users" WHERE "id" IN (SELECT "user_id" FROM "orders" WHERE "status" = \'completed\')',
    );
  });
});
