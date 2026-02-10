import { describe, it, expect } from "vitest";
import { transpile, Dialect } from "../../src/index.js";
import "../../src/dialects/doris.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round-trip: parse as Doris, generate as Doris, compare. */
function validateIdentity(sql: string, writeSql?: string): void {
  const result = transpile(sql, { readDialect: "doris", writeDialect: "doris" })[0];
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
): void {
  const result = transpile(sql, {
    readDialect: opts.read ?? "doris",
    writeDialect: opts.write ?? "doris",
  })[0];
  expect(result).toBe(opts.expected);
}

// ===========================================================================
// Tests
// ===========================================================================

describe("Doris dialect", () => {
  // -------------------------------------------------------------------------
  // Dialect registration
  // -------------------------------------------------------------------------

  describe("registration", () => {
    it("should be registered", () => {
      const d = Dialect.getOrRaise("doris");
      expect(d).toBeDefined();
    });

    it("transpile works with doris dialect", () => {
      const result = transpile("SELECT 1", {
        readDialect: "doris",
        writeDialect: "doris",
      });
      expect(result).toEqual(["SELECT 1"]);
    });
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

    it("backtick table.column round-trip", () => {
      validateIdentity("SELECT `a`.`b` FROM `a`");
    });

    it("backtick three-part name", () => {
      validateIdentity("SELECT `a`.`b`.`c`");
    });

    it("mixed quoted and unquoted identifiers", () => {
      validateIdentity("SELECT `a`.b FROM a");
    });
  });

  // -------------------------------------------------------------------------
  // String quoting
  // -------------------------------------------------------------------------

  describe("string quoting", () => {
    it("single-quoted string", () => {
      validateIdentity("SELECT 'hello'");
    });

    it("empty string", () => {
      validateIdentity("SELECT ''");
    });

    it("double-quoted string parsed as string literal", () => {
      // Doris (like MySQL) treats double-quoted strings as string literals
      const result = transpile('SELECT "hello"', {
        readDialect: "doris",
        writeDialect: "doris",
      })[0];
      expect(result).toBe("SELECT 'hello'");
    });

    it("escaped single quote via doubling", () => {
      validateIdentity("SELECT ''''");
    });

    it.todo("escaped quote in string (backslash escapes)");
  });

  // -------------------------------------------------------------------------
  // Cross-dialect transpilation
  // -------------------------------------------------------------------------

  describe("cross-dialect transpilation", () => {
    it("default -> doris (basic)", () => {
      validateTranspile(
        "SELECT col FROM t WHERE id = 1",
        { read: "sqlglot", expected: "SELECT col FROM t WHERE id = 1" },
      );
    });

    it("doris -> default", () => {
      validateTranspile(
        "SELECT col FROM t WHERE id = 1",
        { write: "sqlglot", expected: "SELECT col FROM t WHERE id = 1" },
      );
    });

    it("doris -> postgres (identifier quoting)", () => {
      validateTranspile(
        "SELECT `col` FROM `t`",
        { write: "postgres", expected: 'SELECT "col" FROM "t"' },
      );
    });

    it("postgres -> doris (identifier quoting)", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { read: "postgres", expected: "SELECT `col` FROM `t`" },
      );
    });

    it("doris -> mysql (backtick to backtick)", () => {
      validateTranspile(
        "SELECT `col` FROM `t`",
        { write: "mysql", expected: "SELECT `col` FROM `t`" },
      );
    });

    it("mysql -> doris (backtick to backtick)", () => {
      validateTranspile(
        "SELECT `col` FROM `t`",
        { read: "mysql", expected: "SELECT `col` FROM `t`" },
      );
    });

    it("doris -> duckdb (identifier quoting)", () => {
      validateTranspile(
        "SELECT `col` FROM `t`",
        { write: "duckdb", expected: 'SELECT "col" FROM "t"' },
      );
    });

    it("default dialect double-quote identifiers -> doris backticks", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { read: "", write: "doris", expected: "SELECT `col` FROM `t`" },
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

    it("SELECT with multiple columns", () => {
      validateIdentity("SELECT a, b, c FROM t");
    });

    it("SELECT with arithmetic", () => {
      validateIdentity("SELECT 1 + 2 * 3");
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

    it("WHERE with subquery IN", () => {
      validateIdentity("SELECT * FROM t WHERE a IN (SELECT b FROM other)");
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

    it("GROUP BY + ORDER BY", () => {
      validateIdentity(
        "SELECT a, COUNT(*) FROM t GROUP BY a ORDER BY a",
      );
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

    it("comma join", () => {
      validateIdentity("SELECT * FROM a, b");
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

    it("CAST to BOOLEAN", () => {
      validateIdentity("SELECT CAST(a AS BOOLEAN)");
    });

    it("CAST to DECIMAL", () => {
      validateIdentity("SELECT CAST(a AS DECIMAL)");
    });

    it("CAST to DECIMAL with precision", () => {
      validateIdentity("SELECT CAST(a AS DECIMAL(10, 2))");
    });

    it("CAST to DATETIME", () => {
      validateIdentity("SELECT CAST(a AS DATETIME)");
    });

    // Type mappings from standard SQL to Doris
    it("TEXT -> VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS TEXT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("BLOB -> STRING", () => {
      validateTranspile(
        "SELECT CAST(a AS BLOB)",
        { read: "sqlglot", expected: "SELECT CAST(a AS STRING)" },
      );
    });

    it("TIMESTAMP -> DATETIME", () => {
      validateTranspile(
        "SELECT CAST(a AS TIMESTAMP)",
        { read: "sqlglot", expected: "SELECT CAST(a AS DATETIME)" },
      );
    });
  });

  // -------------------------------------------------------------------------
  // ILIKE (NOT supported - should map to LIKE)
  // -------------------------------------------------------------------------

  describe("ILIKE", () => {
    it("ILIKE from default dialect transpiled to LIKE in Doris", () => {
      const result = transpile("SELECT a FROM t WHERE a ILIKE '%test%'", {
        readDialect: "",
        writeDialect: "doris",
      })[0];
      expect(result).toBe("SELECT a FROM t WHERE a LIKE '%test%'");
    });

    it("NOT ILIKE from default dialect transpiled to NOT LIKE in Doris", () => {
      const result = transpile("SELECT * FROM t WHERE NOT name ILIKE '%test%'", {
        readDialect: "",
        writeDialect: "doris",
      })[0];
      expect(result).toBe("SELECT * FROM t WHERE NOT name LIKE '%test%'");
    });
  });

  // -------------------------------------------------------------------------
  // Aggregate functions
  // -------------------------------------------------------------------------

  describe("aggregate functions", () => {
    it("COUNT(*)", () => {
      validateIdentity("SELECT COUNT(*) FROM t");
    });

    it("COUNT(column)", () => {
      validateIdentity("SELECT COUNT(a) FROM t");
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

    it("DENSE_RANK", () => {
      validateIdentity(
        "SELECT DENSE_RANK() OVER (PARTITION BY a ORDER BY b) FROM t",
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

    it("scalar subquery in WHERE", () => {
      validateIdentity(
        "SELECT * FROM t WHERE a > (SELECT MAX(b) FROM other)",
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
    it("NOT IN (parser generates NOT x IN form)", () => {
      validateIdentity(
        "SELECT * FROM t WHERE a NOT IN (1, 2, 3)",
        "SELECT * FROM t WHERE NOT a IN (1, 2, 3)",
      );
    });

    it("NOT BETWEEN (parser generates NOT x BETWEEN form)", () => {
      validateIdentity(
        "SELECT * FROM t WHERE a NOT BETWEEN 1 AND 10",
        "SELECT * FROM t WHERE NOT a BETWEEN 1 AND 10",
      );
    });

    it("NOT LIKE (parser generates NOT x LIKE form)", () => {
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
        readDialect: "doris",
        writeDialect: "doris",
      })[0];
      expect(result).toContain("SELECT");
    });

    it("block comment parses", () => {
      const result = transpile("SELECT /* comment */ a FROM t", {
        readDialect: "doris",
        writeDialect: "doris",
      })[0];
      expect(result).toContain("SELECT");
    });

    it("hash comment (#) parses", () => {
      const result = transpile("SELECT 1 # comment", {
        readDialect: "doris",
        writeDialect: "doris",
      })[0];
      expect(result).toBe("SELECT 1");
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

    it("IS TRUE", () => {
      validateIdentity("SELECT a IS TRUE FROM t");
    });

    it("IS FALSE", () => {
      validateIdentity("SELECT a IS FALSE FROM t");
    });
  });

  // -------------------------------------------------------------------------
  // Cross-dialect type transpilation
  // -------------------------------------------------------------------------

  describe("cross-dialect type transpilation", () => {
    it("postgres VARCHAR -> doris VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS VARCHAR)",
        { read: "postgres", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("postgres TEXT -> doris VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS TEXT)",
        { read: "postgres", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("doris INT -> postgres INT", () => {
      validateTranspile(
        "SELECT CAST(a AS INT)",
        { write: "postgres", expected: "SELECT CAST(a AS INT)" },
      );
    });

    it("doris DATETIME -> postgres TIMESTAMP", () => {
      validateTranspile(
        "SELECT CAST(a AS DATETIME)",
        { write: "postgres", expected: "SELECT CAST(a AS TIMESTAMP)" },
      );
    });

    it("doris -> databricks (backtick to backtick)", () => {
      validateTranspile(
        "SELECT `col` FROM `t`",
        { write: "databricks", expected: "SELECT `col` FROM `t`" },
      );
    });

    it("databricks -> doris (backtick to backtick)", () => {
      validateTranspile(
        "SELECT `col` FROM `t`",
        { read: "databricks", expected: "SELECT `col` FROM `t`" },
      );
    });

    it("doris BOOLEAN -> bigquery BOOL", () => {
      validateTranspile(
        "SELECT CAST(a AS BOOLEAN)",
        { write: "bigquery", expected: "SELECT CAST(a AS BOOL)" },
      );
    });

    it("doris -> clickhouse (type mappings)", () => {
      validateTranspile(
        "SELECT CAST(a AS INT)",
        { write: "clickhouse", expected: "SELECT CAST(a AS Int32)" },
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

    it("multiple JOINs with conditions", () => {
      validateIdentity(
        "SELECT a.x, b.y FROM a JOIN b ON a.id = b.id JOIN c ON b.id = c.id WHERE a.x > 1",
      );
    });

    it("CASE in SELECT with backtick-quoted columns", () => {
      validateIdentity(
        "SELECT CASE WHEN `status` = 1 THEN 'active' ELSE 'inactive' END AS `result` FROM `users`",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Functions
  // -------------------------------------------------------------------------

  describe("functions", () => {
    it("COALESCE", () => {
      validateIdentity("SELECT COALESCE(a, b, c) FROM t");
    });

    it("CONCAT", () => {
      validateIdentity("SELECT CONCAT(a, b) FROM t");
    });

    it("UPPER", () => {
      validateIdentity("SELECT UPPER(a) FROM t");
    });

    it("LOWER", () => {
      validateIdentity("SELECT LOWER(a) FROM t");
    });

    it("ABS", () => {
      validateIdentity("SELECT ABS(a) FROM t");
    });

    it("ROUND", () => {
      validateIdentity("SELECT ROUND(a, 2) FROM t");
    });
  });

  // -------------------------------------------------------------------------
  // TODO: features not yet supported
  // -------------------------------------------------------------------------

  describe("todo: advanced features", () => {
    it.todo("CREATE TABLE with Doris properties");
    it.todo("PARTITION BY RANGE");
    it.todo("DISTRIBUTED BY HASH");
    it.todo("DUPLICATE KEY / UNIQUE KEY / AGGREGATE KEY");
    it.todo("INSERT INTO ... VALUES");
    it.todo("UPDATE ... SET");
    it.todo("DELETE FROM ... WHERE");
    it.todo("ALTER TABLE");
    it.todo("DROP TABLE");
    it.todo("SHOW TABLES / DATABASES");
    it.todo("DATE_TRUNC function");
    it.todo("TO_DATE function");
    it.todo("FROM_UNIXTIME function");
    it.todo("UNIX_TIMESTAMP function");
    it.todo("GROUP_CONCAT function");
    it.todo("REGEXP operator");
    it.todo("ARRAY / MAP / STRUCT complex types");
    it.todo("MATERIALIZED VIEW");
    it.todo("REFRESH TRIGGER");
    it.todo("BUILD property");
    it.todo("XOR operator");
    it.todo("DIV integer division");
    it.todo("CAST to SIGNED / UNSIGNED");
    it.todo("# line comments (tokenizer-level)");
    it.todo("LIMIT clause");
    it.todo("OFFSET clause");
  });
});
