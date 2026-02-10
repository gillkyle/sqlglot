import { describe, expect, it } from "vitest";
import { transpile, Dialect } from "../../src/index.js";
import "../../src/dialects/drill.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round-trip: parse as Drill, generate as Drill, compare. */
function validateIdentity(sql: string, writeSql?: string) {
  const result = transpile(sql, { readDialect: "drill", writeDialect: "drill" })[0];
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
    readDialect: opts.read ?? "drill",
    writeDialect: opts.write ?? "drill",
  })[0];
  expect(result).toBe(opts.expected);
}

// ===========================================================================
// Tests
// ===========================================================================

describe("Drill dialect", () => {
  // -------------------------------------------------------------------------
  // Dialect registration
  // -------------------------------------------------------------------------

  it("should be registered", () => {
    const d = Dialect.getOrRaise("drill");
    expect(d).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Identifier quoting
  // -------------------------------------------------------------------------

  describe("identifier quoting", () => {
    it("backtick-quoted identifiers round-trip", () => {
      validateIdentity("SELECT `col` FROM `table`");
    });

    it("unquoted identifiers round-trip", () => {
      validateIdentity("SELECT col FROM t");
    });

    it("reserved word as identifier", () => {
      validateIdentity("SELECT `select` FROM `table`");
    });
  });

  // -------------------------------------------------------------------------
  // String quoting
  // -------------------------------------------------------------------------

  describe("string quoting", () => {
    it("single-quoted string", () => {
      validateIdentity("SELECT 'hello'");
    });

    it.todo("escaped quote in string (single-quote escapes)");
  });

  // -------------------------------------------------------------------------
  // Cross-dialect transpilation
  // -------------------------------------------------------------------------

  describe("cross-dialect transpilation", () => {
    it("default -> drill (basic)", () => {
      validateTranspile(
        "SELECT col FROM t WHERE id = 1",
        { read: "sqlglot", expected: "SELECT col FROM t WHERE id = 1" },
      );
    });

    it("drill -> default", () => {
      validateTranspile(
        "SELECT col FROM t WHERE id = 1",
        { write: "sqlglot", expected: "SELECT col FROM t WHERE id = 1" },
      );
    });

    it("drill -> postgres (identifier quoting)", () => {
      validateTranspile(
        "SELECT `col` FROM `t`",
        { write: "postgres", expected: 'SELECT "col" FROM "t"' },
      );
    });

    it("postgres -> drill (identifier quoting)", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { read: "postgres", expected: "SELECT `col` FROM `t`" },
      );
    });

    it("drill -> mysql (backtick to backtick)", () => {
      validateTranspile(
        "SELECT `col` FROM `t`",
        { write: "mysql", expected: "SELECT `col` FROM `t`" },
      );
    });

    it("mysql -> drill (backtick to backtick)", () => {
      validateTranspile(
        "SELECT `col` FROM `t`",
        { read: "mysql", expected: "SELECT `col` FROM `t`" },
      );
    });

    it("drill -> duckdb", () => {
      validateTranspile(
        "SELECT `col` FROM `t`",
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

    it("CAST to FLOAT", () => {
      validateIdentity("SELECT CAST(a AS FLOAT)");
    });

    it("CAST to DOUBLE", () => {
      validateIdentity("SELECT CAST(a AS DOUBLE)");
    });

    it("CAST to VARCHAR", () => {
      validateIdentity("SELECT CAST(a AS VARCHAR)");
    });

    it("CAST to VARBINARY", () => {
      validateIdentity("SELECT CAST(a AS VARBINARY)");
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

    // Type mappings from standard SQL to Drill
    it("CHAR -> VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS CHAR)",
        { read: "sqlglot", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("TEXT -> VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS TEXT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("NCHAR -> VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS NCHAR)",
        { read: "sqlglot", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("NVARCHAR -> VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS NVARCHAR)",
        { read: "sqlglot", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("BLOB -> VARBINARY", () => {
      validateTranspile(
        "SELECT CAST(a AS BLOB)",
        { read: "sqlglot", expected: "SELECT CAST(a AS VARBINARY)" },
      );
    });

    it("BINARY -> VARBINARY", () => {
      validateTranspile(
        "SELECT CAST(a AS BINARY)",
        { read: "sqlglot", expected: "SELECT CAST(a AS VARBINARY)" },
      );
    });

    it("DATETIME -> TIMESTAMP", () => {
      validateTranspile(
        "SELECT CAST(a AS DATETIME)",
        { read: "sqlglot", expected: "SELECT CAST(a AS TIMESTAMP)" },
      );
    });

    it("SMALLINT -> INTEGER", () => {
      validateTranspile(
        "SELECT CAST(a AS SMALLINT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS INTEGER)" },
      );
    });

    it("TINYINT -> INTEGER", () => {
      validateTranspile(
        "SELECT CAST(a AS TINYINT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS INTEGER)" },
      );
    });
  });

  // -------------------------------------------------------------------------
  // ILIKE (NOT supported natively in Drill)
  // -------------------------------------------------------------------------

  describe("ILIKE", () => {
    it.todo("ILIKE is not natively supported in Drill - should be transpiled");
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
        readDialect: "drill",
        writeDialect: "drill",
      })[0];
      expect(result).toContain("SELECT");
    });

    it("block comment parses", () => {
      const result = transpile("SELECT /* comment */ a FROM t", {
        readDialect: "drill",
        writeDialect: "drill",
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
    it("postgres VARCHAR -> drill VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS VARCHAR)",
        { read: "postgres", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("postgres TEXT -> drill VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS TEXT)",
        { read: "postgres", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("drill INT -> postgres INT", () => {
      validateTranspile(
        "SELECT CAST(a AS INT)",
        { write: "postgres", expected: "SELECT CAST(a AS INT)" },
      );
    });

    it("mysql -> drill (BLOB -> VARBINARY)", () => {
      validateTranspile(
        "SELECT CAST(a AS BLOB)",
        { read: "mysql", expected: "SELECT CAST(a AS VARBINARY)" },
      );
    });

    it("drill BOOLEAN -> bigquery BOOL", () => {
      validateTranspile(
        "SELECT CAST(a AS BOOLEAN)",
        { write: "bigquery", expected: "SELECT CAST(a AS BOOL)" },
      );
    });

    it("drill -> clickhouse (type mappings)", () => {
      validateTranspile(
        "SELECT CAST(a AS INT)",
        { write: "clickhouse", expected: "SELECT CAST(a AS Int32)" },
      );
    });

    it("drill DATETIME -> postgres TIMESTAMP", () => {
      validateTranspile(
        "SELECT CAST(a AS DATETIME)",
        { write: "postgres", expected: "SELECT CAST(a AS TIMESTAMP)" },
      );
    });

    it("snowflake -> drill (NVARCHAR -> VARCHAR)", () => {
      validateTranspile(
        "SELECT CAST(a AS NVARCHAR)",
        { read: "snowflake", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });
  });

  // -------------------------------------------------------------------------
  // TODO: features not yet supported
  // -------------------------------------------------------------------------

  describe("todo: advanced features", () => {
    it.todo("TRY_CAST -> CAST (Drill does not support TRY_CAST)");
    it.todo("TO_DATE / TO_TIMESTAMP functions");
    it.todo("TO_CHAR function");
    it.todo("DATE_ADD / DATE_SUB functions");
    it.todo("FLATTEN / REPEATED_COUNT / REPEATED_CONTAINS");
    it.todo("CONVERT_TO / CONVERT_FROM");
    it.todo("PARTITION BY property on CREATE TABLE");
    it.todo("IF function (backtick-quoted)");
    it.todo("ILike -> backtick-quoted `ILIKE`");
    it.todo("LEVENSHTEIN_DISTANCE function");
    it.todo("REGEXP_MATCHES function (from RegexpLike)");
    it.todo("POW function");
    it.todo("STRPOSITION function");
    it.todo("time format mappings (Java-style -> C-style)");
    it.todo("NULL ordering (nulls_are_last)");
    it.todo("ARRAY / MAP complex types");
    it.todo("storage plugin table references (dfs.tmp.`file`)");
    it.todo("SHOW FILES / SHOW DATABASES");
    it.todo("ALTER SESSION SET");
    it.todo("CTAS with storage format");
  });
});
