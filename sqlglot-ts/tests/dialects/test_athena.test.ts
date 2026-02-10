import { describe, expect, it } from "vitest";
import { transpile, Dialect } from "../../src/index.js";
import "../../src/dialects/athena.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round-trip: parse as Athena, generate as Athena, compare. */
function validateIdentity(sql: string, writeSql?: string) {
  const result = transpile(sql, { readDialect: "athena", writeDialect: "athena" })[0];
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
    readDialect: opts.read ?? "athena",
    writeDialect: opts.write ?? "athena",
  })[0];
  expect(result).toBe(opts.expected);
}

// ===========================================================================
// Tests
// ===========================================================================

describe("Athena dialect", () => {
  // -------------------------------------------------------------------------
  // Dialect registration
  // -------------------------------------------------------------------------

  it("should be registered", () => {
    const d = Dialect.getOrRaise("athena");
    expect(d).toBeDefined();
  });

  it("should have correct class name", () => {
    const d = Dialect.getOrRaise("athena");
    expect(d.constructor.name).toBe("Athena");
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

    it("uses double-quote for identifier start and end", () => {
      const d = Dialect.getOrRaise("athena");
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

    it("uses single-quote for quote start and end", () => {
      const d = Dialect.getOrRaise("athena");
      expect(d.QUOTE_START).toBe("'");
      expect(d.QUOTE_END).toBe("'");
    });

    it("escaped quote in string (quote-doubling)", () => {
      validateIdentity("SELECT ''''");
    });
  });

  // -------------------------------------------------------------------------
  // Cross-dialect transpilation
  // -------------------------------------------------------------------------

  describe("cross-dialect transpilation", () => {
    it("default -> athena (basic)", () => {
      validateTranspile(
        "SELECT col FROM t WHERE id = 1",
        { read: "sqlglot", expected: "SELECT col FROM t WHERE id = 1" },
      );
    });

    it("athena -> default", () => {
      validateTranspile(
        "SELECT col FROM t WHERE id = 1",
        { write: "sqlglot", expected: "SELECT col FROM t WHERE id = 1" },
      );
    });

    it("athena -> postgres (both use double-quote identifiers)", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { write: "postgres", expected: 'SELECT "col" FROM "t"' },
      );
    });

    it("postgres -> athena (both use double-quote identifiers)", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { read: "postgres", expected: 'SELECT "col" FROM "t"' },
      );
    });

    it("athena -> databricks (double-quote -> backtick)", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { write: "databricks", expected: "SELECT `col` FROM `t`" },
      );
    });

    it("databricks -> athena (backtick -> double-quote)", () => {
      validateTranspile(
        "SELECT `col` FROM `t`",
        { read: "databricks", expected: 'SELECT "col" FROM "t"' },
      );
    });

    it("athena -> mysql (double-quote -> backtick)", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { write: "mysql", expected: "SELECT `col` FROM `t`" },
      );
    });

    it("mysql -> athena (backtick -> double-quote)", () => {
      validateTranspile(
        "SELECT `col` FROM `t`",
        { read: "mysql", expected: 'SELECT "col" FROM "t"' },
      );
    });

    it("athena -> bigquery (double-quote -> backtick)", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { write: "bigquery", expected: "SELECT `col` FROM `t`" },
      );
    });

    it("athena -> duckdb (both use double-quote identifiers)", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { write: "duckdb", expected: 'SELECT "col" FROM "t"' },
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

    it("SELECT 1", () => {
      validateIdentity("SELECT 1");
    });

    it("SELECT multiple columns", () => {
      validateIdentity("SELECT a, b, c FROM t");
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

    it("JOIN ... USING", () => {
      validateIdentity("SELECT 1 FROM a JOIN b USING (x)");
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

    it("CASE with operand", () => {
      validateIdentity(
        "SELECT CASE a WHEN 1 THEN 'one' WHEN 2 THEN 'two' ELSE 'other' END",
      );
    });
  });

  // -------------------------------------------------------------------------
  // CAST and type mappings
  // -------------------------------------------------------------------------

  describe("CAST and type mappings", () => {
    it("CAST to INTEGER (native)", () => {
      validateIdentity("SELECT CAST(a AS INTEGER)");
    });

    it("CAST to BIGINT", () => {
      validateIdentity("SELECT CAST(a AS BIGINT)");
    });

    it("CAST to SMALLINT", () => {
      validateIdentity("SELECT CAST(a AS SMALLINT)");
    });

    it("CAST to TINYINT", () => {
      validateIdentity("SELECT CAST(a AS TINYINT)");
    });

    it("CAST to DOUBLE", () => {
      validateIdentity("SELECT CAST(a AS DOUBLE)");
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

    it("CAST to VARCHAR (native)", () => {
      validateIdentity("SELECT CAST(a AS VARCHAR)");
    });

    it("CAST to VARBINARY (native)", () => {
      validateIdentity("SELECT CAST(a AS VARBINARY)");
    });

    it("CAST to DECIMAL", () => {
      validateIdentity("SELECT CAST(a AS DECIMAL)");
    });

    it("CAST to DECIMAL with precision", () => {
      validateIdentity("SELECT CAST(a AS DECIMAL(10, 2))");
    });

    // Type mappings from standard/generic types to Athena types
    it("INT -> INTEGER", () => {
      validateTranspile(
        "SELECT CAST(a AS INT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS INTEGER)" },
      );
    });

    it("FLOAT -> REAL", () => {
      validateTranspile(
        "SELECT CAST(a AS FLOAT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS REAL)" },
      );
    });

    it("TEXT -> VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS TEXT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("BINARY -> VARBINARY", () => {
      validateTranspile(
        "SELECT CAST(a AS BINARY)",
        { read: "sqlglot", expected: "SELECT CAST(a AS VARBINARY)" },
      );
    });

    it("BLOB -> VARBINARY", () => {
      validateTranspile(
        "SELECT CAST(a AS BLOB)",
        { read: "sqlglot", expected: "SELECT CAST(a AS VARBINARY)" },
      );
    });

    it("DATETIME -> TIMESTAMP", () => {
      validateTranspile(
        "SELECT CAST(a AS DATETIME)",
        { read: "sqlglot", expected: "SELECT CAST(a AS TIMESTAMP)" },
      );
    });

    it("STRUCT -> ROW", () => {
      validateTranspile(
        "SELECT CAST(a AS STRUCT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS ROW)" },
      );
    });

    it("TIMESTAMPTZ -> TIMESTAMP", () => {
      validateTranspile(
        "SELECT CAST(a AS TIMESTAMPTZ)",
        { read: "sqlglot", expected: "SELECT CAST(a AS TIMESTAMP)" },
      );
    });

    it("TIMESTAMPNTZ -> TIMESTAMP", () => {
      validateTranspile(
        "SELECT CAST(a AS TIMESTAMPNTZ)",
        { read: "sqlglot", expected: "SELECT CAST(a AS TIMESTAMP)" },
      );
    });
  });

  // -------------------------------------------------------------------------
  // ILIKE (NOT supported in Athena - converted to LIKE)
  // -------------------------------------------------------------------------

  describe("ILIKE (not supported in Athena)", () => {
    it("ILIKE is converted to LIKE when writing to Athena", () => {
      validateTranspile(
        "SELECT a FROM t WHERE a ILIKE '%test%'",
        { read: "sqlglot", expected: "SELECT a FROM t WHERE a LIKE '%test%'" },
      );
    });

    it("ILIKE from Postgres is converted to LIKE in Athena", () => {
      validateTranspile(
        "SELECT a FROM t WHERE a ILIKE '%test%'",
        { read: "postgres", expected: "SELECT a FROM t WHERE a LIKE '%test%'" },
      );
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

    it("COALESCE", () => {
      validateIdentity("SELECT COALESCE(a, b, c) FROM t");
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

    it("RANK with PARTITION BY", () => {
      validateIdentity(
        "SELECT RANK() OVER (PARTITION BY a ORDER BY b) FROM t",
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

    it("nested subquery", () => {
      validateIdentity(
        "SELECT a FROM (SELECT a FROM (SELECT a FROM t) AS t1) AS t2",
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
    it("NOT IN (parser generates NOT a IN form)", () => {
      validateIdentity(
        "SELECT * FROM t WHERE a NOT IN (1, 2, 3)",
        "SELECT * FROM t WHERE NOT a IN (1, 2, 3)",
      );
    });

    it("NOT BETWEEN (parser generates NOT a BETWEEN form)", () => {
      validateIdentity(
        "SELECT * FROM t WHERE a NOT BETWEEN 1 AND 10",
        "SELECT * FROM t WHERE NOT a BETWEEN 1 AND 10",
      );
    });

    it("NOT LIKE (parser generates NOT a LIKE form)", () => {
      validateIdentity(
        "SELECT * FROM t WHERE a NOT LIKE '%x%'",
        "SELECT * FROM t WHERE NOT a LIKE '%x%'",
      );
    });

    it.todo("NOT EXISTS (extra paren wrapping)");
  });

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  describe("comments", () => {
    it("single-line comment (--) parses", () => {
      const result = transpile("SELECT a -- comment\nFROM t", {
        readDialect: "athena",
        writeDialect: "athena",
      })[0];
      expect(result).toContain("SELECT");
    });

    it("block comment parses", () => {
      const result = transpile("SELECT /* comment */ a FROM t", {
        readDialect: "athena",
        writeDialect: "athena",
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

    it("IFNULL", () => {
      validateIdentity("SELECT IFNULL(a, 0) FROM t");
    });

    it("boolean TRUE / FALSE in WHERE", () => {
      validateIdentity("SELECT * FROM t WHERE active = TRUE");
    });
  });

  // -------------------------------------------------------------------------
  // Cross-dialect type transpilation
  // -------------------------------------------------------------------------

  describe("cross-dialect type transpilation", () => {
    it("postgres VARCHAR -> athena VARCHAR (same)", () => {
      validateTranspile(
        "SELECT CAST(a AS VARCHAR)",
        { read: "postgres", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("postgres TEXT -> athena VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS TEXT)",
        { read: "postgres", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("athena INTEGER -> postgres INTEGER", () => {
      validateTranspile(
        "SELECT CAST(a AS INTEGER)",
        { write: "postgres", expected: "SELECT CAST(a AS INTEGER)" },
      );
    });

    it("mysql BLOB -> athena VARBINARY", () => {
      validateTranspile(
        "SELECT CAST(a AS BLOB)",
        { read: "mysql", expected: "SELECT CAST(a AS VARBINARY)" },
      );
    });

    it("athena BOOLEAN -> bigquery BOOL", () => {
      validateTranspile(
        "SELECT CAST(a AS BOOLEAN)",
        { write: "bigquery", expected: "SELECT CAST(a AS BOOL)" },
      );
    });

    it("athena -> clickhouse (INTEGER stays INTEGER)", () => {
      validateTranspile(
        "SELECT CAST(a AS INTEGER)",
        { write: "clickhouse", expected: "SELECT CAST(a AS INTEGER)" },
      );
    });

    it("athena FLOAT -> presto REAL (same family)", () => {
      validateTranspile(
        "SELECT CAST(x AS FLOAT)",
        { read: "sqlglot", write: "presto", expected: "SELECT CAST(x AS REAL)" },
      );
    });

    it("presto to athena (same type mappings)", () => {
      validateTranspile(
        "SELECT a, CAST(b AS VARCHAR) FROM t",
        { read: "presto", expected: "SELECT a, CAST(b AS VARCHAR) FROM t" },
      );
    });

    it("athena to trino (same family)", () => {
      validateTranspile(
        "SELECT a, CAST(b AS INTEGER) FROM t",
        { write: "trino", expected: "SELECT a, CAST(b AS INTEGER) FROM t" },
      );
    });

    it("databricks STRING -> athena (STRING preserved as TEXT mapping)", () => {
      validateTranspile(
        "SELECT CAST(a AS STRING)",
        { read: "databricks", expected: "SELECT CAST(a AS STRING)" },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Complex queries
  // -------------------------------------------------------------------------

  describe("complex queries", () => {
    it("CTE + JOIN + GROUP BY + HAVING + ORDER BY", () => {
      validateIdentity(
        "WITH cte AS (SELECT a, b FROM t1 INNER JOIN t2 ON t1.id = t2.id WHERE t1.active = TRUE) SELECT a, COUNT(*) AS cnt FROM cte GROUP BY a HAVING COUNT(*) > 5 ORDER BY cnt DESC",
      );
    });

    it("nested subqueries", () => {
      validateIdentity(
        "SELECT * FROM (SELECT a FROM (SELECT a FROM t) AS inner_q) AS outer_q",
      );
    });

    it("UNION with ORDER BY", () => {
      validateIdentity(
        "SELECT a FROM t1 UNION ALL SELECT a FROM t2 ORDER BY a",
      );
    });
  });

  // -------------------------------------------------------------------------
  // TODO: features not yet supported
  // -------------------------------------------------------------------------

  describe("todo: advanced features", () => {
    it.todo("UNNEST / LATERAL");
    it.todo("ARRAY[] literal syntax");
    it.todo("ROW(...) constructor syntax");
    it.todo("Bitwise functions (BITWISE_AND, BITWISE_OR, BITWISE_XOR)");
    it.todo("DATE_ADD / DATE_DIFF / DATE_TRUNC with unit argument reordering");
    it.todo("CARDINALITY (array size)");
    it.todo("SEQUENCE (generate series)");
    it.todo("APPROX_DISTINCT / APPROX_PERCENTILE");
    it.todo("FROM_UNIXTIME / TO_UNIXTIME");
    it.todo("String encoding functions (TO_UTF8, FROM_UTF8)");
    it.todo("Time format mappings");
    it.todo("JSON functions (JSON_PARSE, JSON_FORMAT, JSON_EXTRACT)");
    it.todo("INSERT / UPDATE / DELETE / MERGE");
    it.todo("CREATE TABLE / CREATE VIEW / CREATE TABLE AS SELECT");
    it.todo("ALTER TABLE");
    it.todo("DROP TABLE / DROP VIEW");
    it.todo("UNLOAD statement");
    it.todo("Hive DDL routing (CREATE EXTERNAL TABLE, etc.)");
    it.todo("TRY_CAST type mappings");
    it.todo("QUALIFY clause elimination");
  });
});
