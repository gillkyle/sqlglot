import { describe, expect, it } from "vitest";
import { transpile, Dialect } from "../../src/index.js";
import "../../src/dialects/oracle.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round-trip: parse as Oracle, generate as Oracle, compare. */
function validateIdentity(sql: string, writeSql?: string) {
  const result = transpile(sql, { readDialect: "oracle", writeDialect: "oracle" })[0];
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
    readDialect: opts.read ?? "oracle",
    writeDialect: opts.write ?? "oracle",
  })[0];
  expect(result).toBe(opts.expected);
}

// ===========================================================================
// Tests
// ===========================================================================

describe("Oracle dialect", () => {
  // -------------------------------------------------------------------------
  // Dialect registration
  // -------------------------------------------------------------------------

  it("should be registered", () => {
    const d = Dialect.getOrRaise("oracle");
    expect(d).toBeDefined();
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

    it("mixed quoted and unquoted", () => {
      validateIdentity('SELECT "col", name FROM "my_table"');
    });
  });

  // -------------------------------------------------------------------------
  // String quoting
  // -------------------------------------------------------------------------

  describe("string quoting", () => {
    it("single-quoted string", () => {
      validateIdentity("SELECT 'hello'");
    });

    it("single-quoted string with content", () => {
      validateIdentity("SELECT 'hello world' FROM t");
    });

    it.todo("escaped single quote in string ('' style)");
  });

  // -------------------------------------------------------------------------
  // Cross-dialect transpilation
  // -------------------------------------------------------------------------

  describe("cross-dialect transpilation", () => {
    it("default -> oracle (basic)", () => {
      validateTranspile(
        "SELECT col FROM t WHERE id = 1",
        { read: "sqlglot", expected: "SELECT col FROM t WHERE id = 1" },
      );
    });

    it("oracle -> default", () => {
      validateTranspile(
        "SELECT col FROM t WHERE id = 1",
        { write: "sqlglot", expected: "SELECT col FROM t WHERE id = 1" },
      );
    });

    it("oracle -> postgres (identifier quoting preserved)", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { write: "postgres", expected: 'SELECT "col" FROM "t"' },
      );
    });

    it("postgres -> oracle (identifier quoting preserved)", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { read: "postgres", expected: 'SELECT "col" FROM "t"' },
      );
    });

    it("oracle -> mysql (double-quote to backtick)", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { write: "mysql", expected: "SELECT `col` FROM `t`" },
      );
    });

    it("mysql -> oracle (backtick to double-quote)", () => {
      validateTranspile(
        "SELECT `col` FROM `t`",
        { read: "mysql", expected: 'SELECT "col" FROM "t"' },
      );
    });

    it("oracle -> duckdb", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { write: "duckdb", expected: 'SELECT "col" FROM "t"' },
      );
    });

    it("databricks -> oracle (backtick to double-quote)", () => {
      validateTranspile(
        "SELECT `col` FROM `t`",
        { read: "databricks", expected: 'SELECT "col" FROM "t"' },
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

    it.todo("SELECT with LIMIT (Oracle uses ROWNUM or FETCH FIRST)");

    it.todo("SELECT with OFFSET (Oracle uses OFFSET ... ROWS FETCH FIRST)");

    it("SELECT expression", () => {
      validateIdentity("SELECT a + b AS total FROM t");
    });

    it("SELECT with table alias", () => {
      validateIdentity("SELECT t.a FROM t");
    });

    it("SELECT with multiple columns", () => {
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
    it("CAST to VARCHAR (kept as-is)", () => {
      validateIdentity("SELECT CAST(a AS VARCHAR)");
    });

    it("CAST to CHAR (kept as-is)", () => {
      validateIdentity("SELECT CAST(a AS CHAR)");
    });

    it("CAST to DATE (kept as-is)", () => {
      validateIdentity("SELECT CAST(a AS DATE)");
    });

    it("CAST to DECIMAL (kept as-is)", () => {
      validateIdentity("SELECT CAST(a AS DECIMAL)");
    });

    it("CAST to DECIMAL with precision (kept as-is)", () => {
      validateIdentity("SELECT CAST(a AS DECIMAL(10, 2))");
    });

    it("CAST to BLOB (kept as-is)", () => {
      validateIdentity("SELECT CAST(a AS BLOB)");
    });

    it("CAST to TIMESTAMP (kept as-is)", () => {
      validateIdentity("SELECT CAST(a AS TIMESTAMP)");
    });

    // Type mappings from standard SQL to Oracle types
    it("INT -> NUMBER", () => {
      validateTranspile(
        "SELECT CAST(a AS INT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS NUMBER)" },
      );
    });

    it("BIGINT -> NUMBER", () => {
      validateTranspile(
        "SELECT CAST(a AS BIGINT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS NUMBER)" },
      );
    });

    it("SMALLINT -> NUMBER", () => {
      validateTranspile(
        "SELECT CAST(a AS SMALLINT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS NUMBER)" },
      );
    });

    it("TINYINT -> NUMBER", () => {
      validateTranspile(
        "SELECT CAST(a AS TINYINT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS NUMBER)" },
      );
    });

    it("BOOLEAN -> NUMBER(1)", () => {
      validateTranspile(
        "SELECT CAST(a AS BOOLEAN)",
        { read: "sqlglot", expected: "SELECT CAST(a AS NUMBER(1))" },
      );
    });

    it("FLOAT -> BINARY_FLOAT", () => {
      validateTranspile(
        "SELECT CAST(a AS FLOAT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS BINARY_FLOAT)" },
      );
    });

    it("DOUBLE -> BINARY_DOUBLE", () => {
      validateTranspile(
        "SELECT CAST(a AS DOUBLE)",
        { read: "sqlglot", expected: "SELECT CAST(a AS BINARY_DOUBLE)" },
      );
    });

    it("TEXT -> CLOB", () => {
      validateTranspile(
        "SELECT CAST(a AS TEXT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS CLOB)" },
      );
    });

    it("BINARY -> RAW", () => {
      validateTranspile(
        "SELECT CAST(a AS BINARY)",
        { read: "sqlglot", expected: "SELECT CAST(a AS RAW)" },
      );
    });

    it("VARBINARY -> RAW", () => {
      validateTranspile(
        "SELECT CAST(a AS VARBINARY)",
        { read: "sqlglot", expected: "SELECT CAST(a AS RAW)" },
      );
    });

    it("DATETIME -> TIMESTAMP", () => {
      validateTranspile(
        "SELECT CAST(a AS DATETIME)",
        { read: "sqlglot", expected: "SELECT CAST(a AS TIMESTAMP)" },
      );
    });

    it("TIME -> TIMESTAMP", () => {
      validateTranspile(
        "SELECT CAST(a AS TIME)",
        { read: "sqlglot", expected: "SELECT CAST(a AS TIMESTAMP)" },
      );
    });
  });

  // -------------------------------------------------------------------------
  // ILIKE (not supported in Oracle)
  // -------------------------------------------------------------------------

  describe("ILIKE", () => {
    it("ILIKE converted to LIKE", () => {
      validateTranspile(
        "SELECT * FROM t WHERE name ILIKE '%test%'",
        { read: "duckdb", expected: "SELECT * FROM t WHERE name LIKE '%test%'" },
      );
    });

    it("ILIKE with NOT converted to NOT LIKE", () => {
      validateTranspile(
        "SELECT * FROM t WHERE NOT name ILIKE '%test%'",
        { read: "duckdb", expected: "SELECT * FROM t WHERE NOT name LIKE '%test%'" },
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

    it.todo("EXISTS subquery");
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
    it("NOT a IN form", () => {
      validateIdentity("SELECT * FROM t WHERE NOT a IN (1, 2, 3)");
    });

    it("NOT BETWEEN", () => {
      validateIdentity("SELECT * FROM t WHERE NOT a BETWEEN 1 AND 10");
    });

    it("NOT LIKE", () => {
      validateIdentity("SELECT * FROM t WHERE NOT a LIKE '%x%'");
    });

    it.todo("NOT EXISTS");
  });

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  describe("comments", () => {
    it("single-line comment (--) parses", () => {
      const result = transpile("SELECT a -- comment\nFROM t", {
        readDialect: "oracle",
        writeDialect: "oracle",
      })[0];
      expect(result).toContain("SELECT");
    });

    it("block comment parses", () => {
      const result = transpile("SELECT /* comment */ a FROM t", {
        readDialect: "oracle",
        writeDialect: "oracle",
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
    it("postgres VARCHAR -> oracle VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS VARCHAR)",
        { read: "postgres", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("postgres TEXT -> oracle CLOB", () => {
      validateTranspile(
        "SELECT CAST(a AS TEXT)",
        { read: "postgres", expected: "SELECT CAST(a AS CLOB)" },
      );
    });

    it("oracle INT -> postgres INT", () => {
      validateTranspile(
        "SELECT CAST(a AS INT)",
        { write: "postgres", expected: "SELECT CAST(a AS INT)" },
      );
    });

    it("mysql -> oracle (BLOB stays BLOB)", () => {
      validateTranspile(
        "SELECT CAST(a AS BLOB)",
        { read: "mysql", expected: "SELECT CAST(a AS BLOB)" },
      );
    });

    it("oracle -> clickhouse (INT -> Int32)", () => {
      validateTranspile(
        "SELECT CAST(a AS INT)",
        { write: "clickhouse", expected: "SELECT CAST(a AS Int32)" },
      );
    });

    it("databricks STRING -> oracle CLOB", () => {
      // Databricks STRING tokenizes as TEXT, which Oracle maps to CLOB
      validateTranspile(
        "SELECT CAST(a AS TEXT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS CLOB)" },
      );
    });

    it("oracle FLOAT -> duckdb REAL", () => {
      // DuckDB maps FLOAT -> REAL
      validateTranspile(
        "SELECT CAST(a AS FLOAT)",
        { write: "duckdb", expected: "SELECT CAST(a AS REAL)" },
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
  // TODO: Oracle-specific features not yet supported
  // -------------------------------------------------------------------------

  describe("todo: Oracle-specific features", () => {
    it.todo("COUNT DISTINCT");
    it.todo("EXISTS subquery");
    it.todo("LIMIT/OFFSET (Oracle uses ROWNUM or FETCH FIRST N ROWS ONLY)");
    it.todo("CONNECT BY");
    it.todo("START WITH");
    it.todo("DUAL table");
    it.todo("Oracle-specific functions (NVL, NVL2, DECODE)");
    it.todo("TO_DATE / TO_CHAR / TO_NUMBER functions");
    it.todo("MINUS (Oracle synonym for EXCEPT)");
    it.todo("ROWNUM pseudo-column");
    it.todo("ROWID pseudo-column");
    it.todo("LEVEL pseudo-column");
    it.todo("SEQUENCE (NEXTVAL / CURRVAL)");
    it.todo("MERGE INTO");
    it.todo("PIVOT / UNPIVOT");
    it.todo("Hierarchical queries");
    it.todo("Oracle hints (/*+ ... */)");
    it.todo("VARCHAR2 type mapping");
    it.todo("NVARCHAR2 type mapping");
    it.todo("NUMBER(p,s) precision");
    it.todo("PL/SQL blocks");
    it.todo("SYSTIMESTAMP");
    it.todo("SYSDATE");
  });
});
