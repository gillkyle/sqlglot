import { describe, expect, it } from "vitest";
import { transpile, Dialect } from "../../src/index.js";
import "../../src/dialects/risingwave.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round-trip: parse as RisingWave, generate as RisingWave, compare. */
function validateIdentity(sql: string, writeSql?: string) {
  const result = transpile(sql, { readDialect: "risingwave", writeDialect: "risingwave" })[0];
  expect(result).toBe(writeSql ?? sql);
}

/** Parse with readDialect, generate with writeDialect, compare. */
function validateTranspile(
  sql: string,
  opts: {
    read?: string;
    write?: string;
    expected: string;
  },
) {
  const result = transpile(sql, {
    readDialect: opts.read ?? "risingwave",
    writeDialect: opts.write ?? "risingwave",
  })[0];
  expect(result).toBe(opts.expected);
}

// ===========================================================================
// Tests
// ===========================================================================

describe("RisingWave dialect", () => {
  // -------------------------------------------------------------------------
  // Dialect registration
  // -------------------------------------------------------------------------

  it("should be registered", () => {
    const d = Dialect.getOrRaise("risingwave");
    expect(d).toBeDefined();
  });

  it("constructor name is RisingWave", () => {
    const d = Dialect.getOrRaise("risingwave");
    expect(d.constructor.name).toBe("RisingWave");
  });

  // -------------------------------------------------------------------------
  // Identifier quoting
  // -------------------------------------------------------------------------

  describe("identifier quoting", () => {
    it("double-quoted identifiers round-trip", () => {
      validateIdentity('SELECT "col" FROM "table"');
    });

    it("unquoted identifiers round-trip", () => {
      validateIdentity("SELECT col FROM t");
    });

    it("reserved word as identifier", () => {
      validateIdentity('SELECT "select" FROM "table"');
    });

    it("uses double quotes for identifiers", () => {
      const d = Dialect.getOrRaise("risingwave");
      expect(d.IDENTIFIER_START).toBe('"');
      expect(d.IDENTIFIER_END).toBe('"');
    });
  });

  // -------------------------------------------------------------------------
  // String quoting
  // -------------------------------------------------------------------------

  describe("string quoting", () => {
    it("single-quoted string", () => {
      validateIdentity("SELECT 'hello'");
    });

    it("escaped quote in string (quote doubling)", () => {
      validateIdentity("SELECT 'it''s'");
    });
  });

  // -------------------------------------------------------------------------
  // Cross-dialect transpilation
  // -------------------------------------------------------------------------

  describe("cross-dialect transpilation", () => {
    it("default -> risingwave (basic)", () => {
      validateTranspile(
        "SELECT col FROM t WHERE id = 1",
        { read: "sqlglot", expected: "SELECT col FROM t WHERE id = 1" },
      );
    });

    it("risingwave -> default", () => {
      validateTranspile(
        "SELECT col FROM t WHERE id = 1",
        { write: "sqlglot", expected: "SELECT col FROM t WHERE id = 1" },
      );
    });

    it("risingwave -> postgres (same quoting)", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { write: "postgres", expected: 'SELECT "col" FROM "t"' },
      );
    });

    it("postgres -> risingwave (same quoting)", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { read: "postgres", expected: 'SELECT "col" FROM "t"' },
      );
    });

    it("risingwave -> mysql (identifier quoting)", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { write: "mysql", expected: "SELECT `col` FROM `t`" },
      );
    });

    it("mysql -> risingwave (identifier quoting)", () => {
      validateTranspile(
        "SELECT `col` FROM `t`",
        { read: "mysql", expected: 'SELECT "col" FROM "t"' },
      );
    });

    it("risingwave -> databricks", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { write: "databricks", expected: "SELECT `col` FROM `t`" },
      );
    });
  });

  // -------------------------------------------------------------------------
  // SELECT basics
  // -------------------------------------------------------------------------

  describe("SELECT basics", () => {
    it("SELECT *", () => {
      validateIdentity("SELECT * FROM t");
    });

    it("SELECT with alias", () => {
      validateIdentity("SELECT a AS x, b AS y FROM t");
    });

    it("SELECT DISTINCT", () => {
      validateIdentity("SELECT DISTINCT a FROM t");
    });

    it.todo("SELECT with LIMIT");

    it.todo("SELECT with OFFSET");

    it("SELECT expression", () => {
      validateIdentity("SELECT a + b AS total FROM t");
    });

    it("SELECT with table alias", () => {
      validateIdentity("SELECT t.a FROM t");
    });
  });

  // -------------------------------------------------------------------------
  // WHERE clause
  // -------------------------------------------------------------------------

  describe("WHERE clause", () => {
    it("simple WHERE", () => {
      validateIdentity("SELECT * FROM t WHERE a = 1");
    });

    it("WHERE with AND", () => {
      validateIdentity("SELECT * FROM t WHERE a = 1 AND b = 2");
    });

    it("WHERE with OR", () => {
      validateIdentity("SELECT * FROM t WHERE a = 1 OR b = 2");
    });

    it("WHERE IN", () => {
      validateIdentity("SELECT * FROM t WHERE a IN (1, 2, 3)");
    });

    it("WHERE BETWEEN", () => {
      validateIdentity("SELECT * FROM t WHERE a BETWEEN 1 AND 10");
    });

    it("WHERE LIKE", () => {
      validateIdentity("SELECT * FROM t WHERE name LIKE '%test%'");
    });

    it("WHERE IS NULL", () => {
      validateIdentity("SELECT * FROM t WHERE a IS NULL");
    });

    it("WHERE IS NOT NULL", () => {
      validateIdentity("SELECT * FROM t WHERE a IS NOT NULL");
    });
  });

  // -------------------------------------------------------------------------
  // GROUP BY / HAVING / ORDER BY
  // -------------------------------------------------------------------------

  describe("GROUP BY / HAVING / ORDER BY", () => {
    it("GROUP BY", () => {
      validateIdentity("SELECT a, COUNT(*) FROM t GROUP BY a");
    });

    it("GROUP BY with HAVING", () => {
      validateIdentity(
        "SELECT a, COUNT(*) FROM t GROUP BY a HAVING COUNT(*) > 1",
      );
    });

    it("ORDER BY", () => {
      validateIdentity("SELECT * FROM t ORDER BY a");
    });

    it("ORDER BY DESC", () => {
      validateIdentity("SELECT * FROM t ORDER BY a DESC");
    });

    it("ORDER BY multiple columns", () => {
      validateIdentity("SELECT * FROM t ORDER BY a, b DESC");
    });
  });

  // -------------------------------------------------------------------------
  // JOINs
  // -------------------------------------------------------------------------

  describe("JOINs", () => {
    it("INNER JOIN", () => {
      validateIdentity("SELECT * FROM a INNER JOIN b ON a.id = b.id");
    });

    it("LEFT JOIN", () => {
      validateIdentity("SELECT * FROM a LEFT JOIN b ON a.id = b.id");
    });

    it("RIGHT JOIN", () => {
      validateIdentity("SELECT * FROM a RIGHT JOIN b ON a.id = b.id");
    });

    it("FULL OUTER JOIN", () => {
      validateIdentity("SELECT * FROM a FULL OUTER JOIN b ON a.id = b.id");
    });

    it("CROSS JOIN", () => {
      validateIdentity("SELECT * FROM a CROSS JOIN b");
    });

    it("multiple JOINs", () => {
      validateIdentity(
        "SELECT * FROM a INNER JOIN b ON a.id = b.id LEFT JOIN c ON b.id = c.id",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Set operations
  // -------------------------------------------------------------------------

  describe("set operations", () => {
    it("UNION", () => {
      validateIdentity("SELECT a FROM t1 UNION SELECT a FROM t2");
    });

    it("UNION ALL", () => {
      validateIdentity("SELECT a FROM t1 UNION ALL SELECT a FROM t2");
    });

    it("INTERSECT", () => {
      validateIdentity("SELECT a FROM t1 INTERSECT SELECT a FROM t2");
    });

    it("EXCEPT", () => {
      validateIdentity("SELECT a FROM t1 EXCEPT SELECT a FROM t2");
    });
  });

  // -------------------------------------------------------------------------
  // CTEs (Common Table Expressions)
  // -------------------------------------------------------------------------

  describe("CTEs", () => {
    it("simple CTE", () => {
      validateIdentity(
        "WITH cte AS (SELECT a FROM t) SELECT * FROM cte",
      );
    });

    it("multiple CTEs", () => {
      validateIdentity(
        "WITH cte1 AS (SELECT a FROM t1), cte2 AS (SELECT b FROM t2) SELECT * FROM cte1 INNER JOIN cte2 ON cte1.a = cte2.b",
      );
    });
  });

  // -------------------------------------------------------------------------
  // CASE WHEN
  // -------------------------------------------------------------------------

  describe("CASE WHEN", () => {
    it("simple CASE", () => {
      validateIdentity(
        "SELECT CASE WHEN a = 1 THEN 'one' ELSE 'other' END FROM t",
      );
    });

    it("CASE with multiple WHENs", () => {
      validateIdentity(
        "SELECT CASE WHEN a = 1 THEN 'one' WHEN a = 2 THEN 'two' ELSE 'other' END FROM t",
      );
    });

    it("CASE without ELSE", () => {
      validateIdentity(
        "SELECT CASE WHEN a = 1 THEN 'one' END FROM t",
      );
    });
  });

  // -------------------------------------------------------------------------
  // CAST and type mappings
  // -------------------------------------------------------------------------

  describe("CAST and type mappings", () => {
    it("CAST to INT", () => {
      validateIdentity("SELECT CAST(a AS INT)");
    });

    it("CAST to BIGINT", () => {
      validateIdentity("SELECT CAST(a AS BIGINT)");
    });

    it("CAST to SMALLINT", () => {
      validateIdentity("SELECT CAST(a AS SMALLINT)");
    });

    it("CAST to BOOLEAN", () => {
      validateIdentity("SELECT CAST(a AS BOOLEAN)");
    });

    it("CAST to DATE", () => {
      validateIdentity("SELECT CAST(a AS DATE)");
    });

    it("CAST to TIMESTAMP", () => {
      validateIdentity("SELECT CAST(a AS TIMESTAMP)");
    });

    it("CAST to DECIMAL", () => {
      validateIdentity("SELECT CAST(a AS DECIMAL)");
    });

    it("CAST to DECIMAL with precision", () => {
      validateIdentity("SELECT CAST(a AS DECIMAL(10, 2))");
    });

    it("CAST to VARCHAR", () => {
      validateIdentity("SELECT CAST(a AS VARCHAR)");
    });

    it("CAST to TEXT", () => {
      validateIdentity("SELECT CAST(a AS TEXT)");
    });

    // Type mappings from standard SQL to RisingWave (same as Postgres)
    it("TINYINT -> SMALLINT", () => {
      validateTranspile(
        "SELECT CAST(a AS TINYINT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS SMALLINT)" },
      );
    });

    it("FLOAT -> REAL", () => {
      validateTranspile(
        "SELECT CAST(a AS FLOAT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS REAL)" },
      );
    });

    it("DOUBLE -> DOUBLE PRECISION", () => {
      validateTranspile(
        "SELECT CAST(a AS DOUBLE)",
        { read: "sqlglot", expected: "SELECT CAST(a AS DOUBLE PRECISION)" },
      );
    });

    it("BINARY -> BYTEA", () => {
      validateTranspile(
        "SELECT CAST(a AS BINARY)",
        { read: "sqlglot", expected: "SELECT CAST(a AS BYTEA)" },
      );
    });

    it("VARBINARY -> BYTEA", () => {
      validateTranspile(
        "SELECT CAST(a AS VARBINARY)",
        { read: "sqlglot", expected: "SELECT CAST(a AS BYTEA)" },
      );
    });

    it("BLOB -> BYTEA", () => {
      validateTranspile(
        "SELECT CAST(a AS BLOB)",
        { read: "sqlglot", expected: "SELECT CAST(a AS BYTEA)" },
      );
    });

    it("DATETIME -> TIMESTAMP", () => {
      validateTranspile(
        "SELECT CAST(a AS DATETIME)",
        { read: "sqlglot", expected: "SELECT CAST(a AS TIMESTAMP)" },
      );
    });
  });

  // -------------------------------------------------------------------------
  // ILIKE support (RisingWave supports ILIKE natively, like Postgres)
  // -------------------------------------------------------------------------

  describe("ILIKE", () => {
    it("ILIKE round-trips natively", () => {
      validateIdentity("SELECT * FROM t WHERE name ILIKE '%test%'");
    });

    it("ILIKE with NOT", () => {
      validateIdentity("SELECT * FROM t WHERE NOT name ILIKE '%test%'");
    });
  });

  // -------------------------------------------------------------------------
  // Aggregate functions
  // -------------------------------------------------------------------------

  describe("aggregate functions", () => {
    it("COUNT", () => {
      validateIdentity("SELECT COUNT(*) FROM t");
    });

    it("SUM", () => {
      validateIdentity("SELECT SUM(a) FROM t");
    });

    it("AVG", () => {
      validateIdentity("SELECT AVG(a) FROM t");
    });

    it("MIN / MAX", () => {
      validateIdentity("SELECT MIN(a), MAX(a) FROM t");
    });

    it.todo("COUNT DISTINCT");
  });

  // -------------------------------------------------------------------------
  // Window functions
  // -------------------------------------------------------------------------

  describe("window functions", () => {
    it("ROW_NUMBER", () => {
      validateIdentity(
        "SELECT ROW_NUMBER() OVER (PARTITION BY a ORDER BY b) FROM t",
      );
    });

    it("RANK", () => {
      validateIdentity(
        "SELECT RANK() OVER (ORDER BY a DESC) FROM t",
      );
    });

    it("SUM window", () => {
      validateIdentity(
        "SELECT SUM(a) OVER (PARTITION BY b ORDER BY c) FROM t",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Subqueries
  // -------------------------------------------------------------------------

  describe("subqueries", () => {
    it("subquery in FROM", () => {
      validateIdentity(
        "SELECT * FROM (SELECT a, b FROM t) AS sub",
      );
    });

    it("subquery in WHERE", () => {
      validateIdentity(
        "SELECT * FROM t WHERE a IN (SELECT a FROM t2)",
      );
    });

    it.todo("EXISTS subquery (extra paren wrapping)");
  });

  // -------------------------------------------------------------------------
  // Literals
  // -------------------------------------------------------------------------

  describe("literals", () => {
    it("integer literal", () => {
      validateIdentity("SELECT 42");
    });

    it("float literal", () => {
      validateIdentity("SELECT 3.14");
    });

    it("string literal", () => {
      validateIdentity("SELECT 'hello world'");
    });

    it("NULL literal", () => {
      validateIdentity("SELECT NULL");
    });

    it("TRUE / FALSE", () => {
      validateIdentity("SELECT TRUE, FALSE");
    });
  });

  // -------------------------------------------------------------------------
  // NOT variations
  // -------------------------------------------------------------------------

  describe("NOT variations", () => {
    it("NOT IN", () => {
      validateIdentity("SELECT * FROM t WHERE NOT a IN (1, 2, 3)");
    });

    it("NOT BETWEEN", () => {
      validateIdentity("SELECT * FROM t WHERE NOT a BETWEEN 1 AND 10");
    });

    it("NOT LIKE", () => {
      validateIdentity("SELECT * FROM t WHERE NOT a LIKE '%x%'");
    });

    it.todo("NOT EXISTS (extra paren wrapping)");
  });

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  describe("comments", () => {
    it("single-line comment (--) parses", () => {
      const result = transpile("SELECT a -- comment\nFROM t", {
        readDialect: "risingwave",
        writeDialect: "risingwave",
      })[0];
      expect(result).toContain("SELECT");
    });

    it("block comment parses", () => {
      const result = transpile("SELECT /* comment */ a FROM t", {
        readDialect: "risingwave",
        writeDialect: "risingwave",
      })[0];
      expect(result).toContain("SELECT");
    });
  });

  // -------------------------------------------------------------------------
  // NULL and BOOLEAN handling
  // -------------------------------------------------------------------------

  describe("NULL and BOOLEAN handling", () => {
    it("IS NULL", () => {
      validateIdentity("SELECT * FROM t WHERE a IS NULL");
    });

    it("IS NOT NULL", () => {
      validateIdentity("SELECT * FROM t WHERE a IS NOT NULL");
    });

    it("COALESCE", () => {
      validateIdentity("SELECT COALESCE(a, b, c) FROM t");
    });

    it("NULLIF", () => {
      validateIdentity("SELECT NULLIF(a, 0) FROM t");
    });

    it("boolean TRUE / FALSE in WHERE", () => {
      validateIdentity("SELECT * FROM t WHERE active = TRUE");
    });
  });

  // -------------------------------------------------------------------------
  // Cross-dialect type transpilation
  // -------------------------------------------------------------------------

  describe("cross-dialect type transpilation", () => {
    it("postgres INT -> risingwave INT", () => {
      validateTranspile(
        "SELECT CAST(a AS INT)",
        { read: "postgres", expected: "SELECT CAST(a AS INT)" },
      );
    });

    it("postgres TEXT -> risingwave TEXT", () => {
      validateTranspile(
        "SELECT CAST(a AS TEXT)",
        { read: "postgres", expected: "SELECT CAST(a AS TEXT)" },
      );
    });

    it("risingwave INT -> postgres INT", () => {
      validateTranspile(
        "SELECT CAST(a AS INT)",
        { write: "postgres", expected: "SELECT CAST(a AS INT)" },
      );
    });

    it("mysql -> risingwave (BLOB -> BYTEA)", () => {
      validateTranspile(
        "SELECT CAST(a AS BLOB)",
        { read: "mysql", expected: "SELECT CAST(a AS BYTEA)" },
      );
    });

    it("risingwave BOOLEAN -> bigquery BOOL", () => {
      validateTranspile(
        "SELECT CAST(a AS BOOLEAN)",
        { write: "bigquery", expected: "SELECT CAST(a AS BOOL)" },
      );
    });

    it.todo("databricks -> risingwave (STRING -> TEXT) (cross-dialect type normalization)");

    it("risingwave -> databricks (TEXT -> STRING)", () => {
      validateTranspile(
        "SELECT CAST(a AS TEXT)",
        { write: "databricks", expected: "SELECT CAST(a AS STRING)" },
      );
    });
  });

  // -------------------------------------------------------------------------
  // TODO: features not yet supported
  // -------------------------------------------------------------------------

  describe("todo: advanced features", () => {
    it.todo("CREATE SOURCE");
    it.todo("CREATE SINK");
    it.todo("CREATE MATERIALIZED VIEW");
    it.todo("WATERMARK column constraint");
    it.todo("ENCODE property");
    it.todo("INCLUDE property");
    it.todo("MAP data type");
    it.todo("STRUCT data type");
    it.todo(":: cast operator syntax");
    it.todo("ARRAY[] literal syntax");
    it.todo("JSON operators");
    it.todo("INTERVAL syntax");
    it.todo("GENERATE_SERIES function");
    it.todo("LATERAL joins");
    it.todo("LIMIT/OFFSET");
    it.todo("Window functions with ROWS/RANGE frames");
  });
});
