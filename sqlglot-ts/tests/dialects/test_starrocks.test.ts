import { describe, expect, it } from "vitest";
import { transpile, Dialect } from "../../src/index.js";
import "../../src/dialects/starrocks.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round-trip: parse as StarRocks, generate as StarRocks, compare. */
function validateIdentity(sql: string, writeSql?: string) {
  const result = transpile(sql, { readDialect: "starrocks", writeDialect: "starrocks" })[0];
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
    readDialect: opts.read ?? "starrocks",
    writeDialect: opts.write ?? "starrocks",
  })[0];
  expect(result).toBe(opts.expected);
}

// ===========================================================================
// Tests
// ===========================================================================

describe("StarRocks dialect", () => {
  // -------------------------------------------------------------------------
  // Dialect registration
  // -------------------------------------------------------------------------

  it("should be registered under 'starrocks'", () => {
    const d = Dialect.getOrRaise("starrocks");
    expect(d).toBeDefined();
    expect(d.constructor.name).toBe("StarRocks");
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

    it("backtick-quoted table.column round-trip", () => {
      validateIdentity("SELECT `a`.`b` FROM `a`");
    });

    it("mixed quoted and unquoted identifiers", () => {
      validateIdentity("SELECT `a`.b FROM a");
    });

    it("uses backtick for IDENTIFIER_START/END", () => {
      const d = Dialect.getOrRaise("starrocks");
      expect(d.IDENTIFIER_START).toBe("`");
      expect(d.IDENTIFIER_END).toBe("`");
    });
  });

  // -------------------------------------------------------------------------
  // String quoting
  // -------------------------------------------------------------------------

  describe("string quoting", () => {
    it("single-quoted string", () => {
      validateIdentity("SELECT 'hello'");
    });

    it("uses single-quote for QUOTE_START/END", () => {
      const d = Dialect.getOrRaise("starrocks");
      expect(d.QUOTE_START).toBe("'");
      expect(d.QUOTE_END).toBe("'");
    });

    it.todo("escaped quote in string (backslash escapes)");
    it.todo("escaped quote in string (quote-doubling escapes)");
  });

  // -------------------------------------------------------------------------
  // Cross-dialect transpilation
  // -------------------------------------------------------------------------

  describe("cross-dialect transpilation", () => {
    it("default -> starrocks (basic)", () => {
      validateTranspile(
        "SELECT col FROM t WHERE id = 1",
        { read: "", expected: "SELECT col FROM t WHERE id = 1" },
      );
    });

    it("starrocks -> default", () => {
      validateTranspile(
        "SELECT col FROM t WHERE id = 1",
        { write: "", expected: "SELECT col FROM t WHERE id = 1" },
      );
    });

    it("starrocks -> default (backtick -> double-quote)", () => {
      validateTranspile("SELECT `col` FROM `tbl`", {
        read: "starrocks",
        write: "",
        expected: 'SELECT "col" FROM "tbl"',
      });
    });

    it("default -> starrocks (double-quote -> backtick)", () => {
      validateTranspile('SELECT "col" FROM "tbl"', {
        read: "",
        write: "starrocks",
        expected: "SELECT `col` FROM `tbl`",
      });
    });

    it("starrocks -> postgres (backtick -> double-quote)", () => {
      validateTranspile("SELECT `col` FROM `tbl`", {
        read: "starrocks",
        write: "postgres",
        expected: 'SELECT "col" FROM "tbl"',
      });
    });

    it("postgres -> starrocks (double-quote -> backtick)", () => {
      validateTranspile('SELECT "col" FROM "tbl"', {
        read: "postgres",
        write: "starrocks",
        expected: "SELECT `col` FROM `tbl`",
      });
    });

    it("mysql -> starrocks (basic SQL passes through)", () => {
      validateTranspile("SELECT `col` FROM `tbl`", {
        read: "mysql",
        write: "starrocks",
        expected: "SELECT `col` FROM `tbl`",
      });
    });

    it("starrocks -> mysql (backtick to backtick)", () => {
      validateTranspile("SELECT `col` FROM `tbl`", {
        read: "starrocks",
        write: "mysql",
        expected: "SELECT `col` FROM `tbl`",
      });
    });

    it("starrocks -> duckdb", () => {
      validateTranspile("SELECT `col` FROM `tbl`", {
        read: "starrocks",
        write: "duckdb",
        expected: 'SELECT "col" FROM "tbl"',
      });
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

    it("SELECT expression", () => {
      validateIdentity("SELECT a + b AS total FROM t");
    });

    it("SELECT with table alias", () => {
      validateIdentity("SELECT t.a FROM t");
    });

    it("SELECT 1", () => {
      validateIdentity("SELECT 1");
    });

    it("SELECT with multiple columns", () => {
      validateIdentity("SELECT a, b, c FROM test");
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

    it("JOIN (implicit INNER)", () => {
      validateIdentity("SELECT 1 FROM a JOIN b ON a.x = b.x");
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

    it("CAST to CHAR", () => {
      validateIdentity("SELECT CAST(a AS CHAR)");
    });

    it("CAST to DATE", () => {
      validateIdentity("SELECT CAST(a AS DATE)");
    });

    it("CAST to DECIMAL", () => {
      validateIdentity("SELECT CAST(a AS DECIMAL)");
    });

    it("CAST to DECIMAL with precision", () => {
      validateIdentity("SELECT CAST(a AS DECIMAL(10, 2))");
    });

    it("CAST to BOOLEAN", () => {
      validateIdentity("SELECT CAST(a AS BOOLEAN)");
    });

    it("CAST to BLOB", () => {
      validateIdentity("SELECT CAST(a AS BLOB)");
    });

    // Type mappings: standard SQL -> StarRocks
    it("TEXT -> VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS TEXT)",
        { read: "", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("TIMESTAMP -> DATETIME", () => {
      validateTranspile(
        "SELECT CAST(a AS TIMESTAMP)",
        { read: "", expected: "SELECT CAST(a AS DATETIME)" },
      );
    });

    it("DATETIME round-trips as DATETIME", () => {
      validateIdentity("SELECT CAST(a AS DATETIME)");
    });
  });

  // -------------------------------------------------------------------------
  // ILIKE (NOT supported)
  // -------------------------------------------------------------------------

  describe("ILIKE", () => {
    it("ILIKE from default -> StarRocks transpiled to LIKE", () => {
      const result = transpile("SELECT a FROM t WHERE a ILIKE '%test%'", {
        readDialect: "",
        writeDialect: "starrocks",
      })[0];
      expect(result).toBe("SELECT a FROM t WHERE a LIKE '%test%'");
    });

    it("NOT ILIKE from default -> StarRocks transpiled to NOT LIKE", () => {
      const result = transpile("SELECT a FROM t WHERE NOT a ILIKE '%test%'", {
        readDialect: "",
        writeDialect: "starrocks",
      })[0];
      expect(result).toBe("SELECT a FROM t WHERE NOT a LIKE '%test%'");
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

    it("ROW_NUMBER simple", () => {
      validateIdentity("SELECT ROW_NUMBER() OVER (ORDER BY a) FROM t");
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
    it("NOT IN", () => {
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
        readDialect: "starrocks",
        writeDialect: "starrocks",
      })[0];
      expect(result).toContain("SELECT");
    });

    it("block comment parses", () => {
      const result = transpile("SELECT /* comment */ a FROM t", {
        readDialect: "starrocks",
        writeDialect: "starrocks",
      })[0];
      expect(result).toContain("SELECT");
    });

    it("hash comment (#) parses", () => {
      const result = transpile("SELECT a # comment\nFROM t", {
        readDialect: "starrocks",
        writeDialect: "starrocks",
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
    it("postgres VARCHAR -> starrocks VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS VARCHAR)",
        { read: "postgres", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("postgres TEXT -> starrocks VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS TEXT)",
        { read: "postgres", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("starrocks INT -> postgres INT", () => {
      validateTranspile(
        "SELECT CAST(a AS INT)",
        { write: "postgres", expected: "SELECT CAST(a AS INT)" },
      );
    });

    it("starrocks -> duckdb (INT stays INT)", () => {
      validateTranspile(
        "SELECT CAST(a AS INT)",
        { write: "duckdb", expected: "SELECT CAST(a AS INT)" },
      );
    });

    it("starrocks BOOLEAN -> bigquery BOOL", () => {
      validateTranspile(
        "SELECT CAST(a AS BOOLEAN)",
        { write: "bigquery", expected: "SELECT CAST(a AS BOOL)" },
      );
    });

    it("starrocks -> clickhouse (INT -> Int32)", () => {
      validateTranspile(
        "SELECT CAST(a AS INT)",
        { write: "clickhouse", expected: "SELECT CAST(a AS Int32)" },
      );
    });

    it("databricks STRING -> starrocks VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS STRING)",
        { read: "databricks", expected: "SELECT CAST(a AS VARCHAR)" },
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

    it("CTE with UNION", () => {
      validateIdentity(
        "WITH cte AS (SELECT 1) SELECT * FROM cte UNION ALL SELECT 2",
      );
    });

    it("multiple JOINs with conditions", () => {
      validateIdentity(
        "SELECT a.x, b.y FROM a JOIN b ON a.id = b.id JOIN c ON b.id = c.id WHERE a.x > 1",
      );
    });
  });

  // -------------------------------------------------------------------------
  // TODO: features not yet implemented
  // -------------------------------------------------------------------------

  describe("todo: advanced features", () => {
    it.todo("LARGEINT keyword (maps to INT128)");
    it.todo("DATE_TRUNC function");
    it.todo("DATEDIFF / DATE_DIFF functions");
    it.todo("ARRAY_AGG / ARRAY_FILTER / ARRAY_JOIN functions");
    it.todo("APPROX_COUNT_DISTINCT function");
    it.todo("JSON arrow extraction (->, ->>)");
    it.todo("UNNEST with default alias");
    it.todo("DELETE with BETWEEN elimination");
    it.todo("CREATE TABLE with PRIMARY KEY outside schema");
    it.todo("PARTITION BY RANGE / dynamic partitioning");
    it.todo("ROLLUP property");
    it.todo("REFRESH property for materialized views");
    it.todo("SHOW command variants");
    it.todo("Reserved keywords list");
    it.todo("INSERT OVERWRITE");
    it.todo("TimestampTrunc -> DATE_TRUNC with unit");
    it.todo("FROM_UNIXTIME / UNIX_TIMESTAMP");
    it.todo("REGEXP function");
    it.todo("ST_Distance_Sphere spatial function");
    it.todo("PARSE_JSON function");
  });
});
