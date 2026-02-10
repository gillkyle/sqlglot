import { describe, expect, it } from "vitest";
import { transpile, Dialect } from "../../src/index.js";
import "../../src/dialects/fabric.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round-trip: parse as Fabric, generate as Fabric, compare. */
function validateIdentity(sql: string, writeSql?: string) {
  const result = transpile(sql, { readDialect: "fabric", writeDialect: "fabric" })[0];
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
    readDialect: opts.read ?? "fabric",
    writeDialect: opts.write ?? "fabric",
  })[0];
  expect(result).toBe(opts.expected);
}

// ===========================================================================
// Tests
// ===========================================================================

describe("Fabric dialect", () => {
  // -------------------------------------------------------------------------
  // Dialect registration
  // -------------------------------------------------------------------------

  it("should be registered", () => {
    const d = Dialect.getOrRaise("fabric");
    expect(d).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Identifier quoting
  // -------------------------------------------------------------------------

  describe("identifier quoting", () => {
    it("bracket-quoted identifiers round-trip", () => {
      validateIdentity("SELECT [col] FROM [table]");
    });

    it("unquoted identifiers round-trip", () => {
      validateIdentity("SELECT col FROM t");
    });

    it("reserved word as identifier", () => {
      validateIdentity("SELECT [select] FROM [table]");
    });

    it("multi-word bracket identifiers", () => {
      validateIdentity("SELECT [my column] FROM [my table]");
    });

    it("bracket identifiers with schema qualification", () => {
      validateIdentity("SELECT [dbo].[col] FROM [dbo].[table]");
    });
  });

  // -------------------------------------------------------------------------
  // String quoting
  // -------------------------------------------------------------------------

  describe("string quoting", () => {
    it("single-quoted string", () => {
      validateIdentity("SELECT 'hello'");
    });

    it("escaped quote in string (quote-doubling)", () => {
      validateIdentity("SELECT 'it''s a test'");
    });
  });

  // -------------------------------------------------------------------------
  // Cross-dialect transpilation
  // -------------------------------------------------------------------------

  describe("cross-dialect transpilation", () => {
    it("default -> fabric (basic)", () => {
      validateTranspile(
        "SELECT col FROM t WHERE id = 1",
        { read: "sqlglot", expected: "SELECT col FROM t WHERE id = 1" },
      );
    });

    it("fabric -> default", () => {
      validateTranspile(
        "SELECT col FROM t WHERE id = 1",
        { write: "sqlglot", expected: "SELECT col FROM t WHERE id = 1" },
      );
    });

    it("fabric -> postgres (identifier quoting)", () => {
      validateTranspile(
        "SELECT [col] FROM [t]",
        { write: "postgres", expected: 'SELECT "col" FROM "t"' },
      );
    });

    it("postgres -> fabric (identifier quoting)", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { read: "postgres", expected: "SELECT [col] FROM [t]" },
      );
    });

    it("fabric -> databricks (bracket to backtick)", () => {
      validateTranspile(
        "SELECT [col] FROM [t]",
        { write: "databricks", expected: "SELECT `col` FROM `t`" },
      );
    });

    it("databricks -> fabric (backtick to bracket)", () => {
      validateTranspile(
        "SELECT `col` FROM `t`",
        { read: "databricks", expected: "SELECT [col] FROM [t]" },
      );
    });

    it("fabric -> duckdb (bracket to double-quote)", () => {
      validateTranspile(
        "SELECT [col] FROM [t]",
        { write: "duckdb", expected: 'SELECT "col" FROM "t"' },
      );
    });

    it("fabric -> mysql (bracket to backtick)", () => {
      validateTranspile(
        "SELECT [col] FROM [t]",
        { write: "mysql", expected: "SELECT `col` FROM `t`" },
      );
    });

    it("tsql -> fabric (bracket to bracket)", () => {
      validateTranspile(
        "SELECT [col] FROM [t]",
        { read: "tsql", expected: "SELECT [col] FROM [t]" },
      );
    });

    it("fabric -> tsql (bracket to bracket)", () => {
      validateTranspile(
        "SELECT [col] FROM [t]",
        { write: "tsql", expected: "SELECT [col] FROM [t]" },
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

    it.todo("SELECT with LIMIT (T-SQL uses TOP / OFFSET FETCH)");

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

    it("CAST to FLOAT", () => {
      validateIdentity("SELECT CAST(a AS FLOAT)");
    });

    it("CAST to VARCHAR", () => {
      validateIdentity("SELECT CAST(a AS VARCHAR)");
    });

    it("CAST to CHAR", () => {
      validateIdentity("SELECT CAST(a AS CHAR)");
    });

    it("CAST to NVARCHAR round-trips as VARCHAR", () => {
      // Fabric maps NVARCHAR -> VARCHAR
      validateIdentity("SELECT CAST(a AS NVARCHAR)", "SELECT CAST(a AS VARCHAR)");
    });

    it("CAST to NCHAR round-trips as CHAR", () => {
      // Fabric maps NCHAR -> CHAR
      validateIdentity("SELECT CAST(a AS NCHAR)", "SELECT CAST(a AS CHAR)");
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

    // Type mappings from standard SQL types to Fabric types
    it("BOOLEAN -> BIT", () => {
      validateTranspile(
        "SELECT CAST(a AS BOOLEAN)",
        { read: "sqlglot", expected: "SELECT CAST(a AS BIT)" },
      );
    });

    it("TEXT -> VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS TEXT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("BLOB -> VARBINARY", () => {
      validateTranspile(
        "SELECT CAST(a AS BLOB)",
        { read: "sqlglot", expected: "SELECT CAST(a AS VARBINARY)" },
      );
    });

    it("DOUBLE -> FLOAT", () => {
      validateTranspile(
        "SELECT CAST(a AS DOUBLE)",
        { read: "sqlglot", expected: "SELECT CAST(a AS FLOAT)" },
      );
    });

    it("DATETIME -> DATETIME2", () => {
      validateTranspile(
        "SELECT CAST(a AS DATETIME)",
        { read: "sqlglot", expected: "SELECT CAST(a AS DATETIME2)" },
      );
    });

    it("TIMESTAMP -> DATETIME2", () => {
      validateTranspile(
        "SELECT CAST(a AS TIMESTAMP)",
        { read: "sqlglot", expected: "SELECT CAST(a AS DATETIME2)" },
      );
    });

    it("INT stays as INT", () => {
      validateTranspile(
        "SELECT CAST(a AS INT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS INT)" },
      );
    });

    it("BIGINT stays as BIGINT", () => {
      validateTranspile(
        "SELECT CAST(a AS BIGINT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS BIGINT)" },
      );
    });

    it("SMALLINT stays as SMALLINT", () => {
      validateTranspile(
        "SELECT CAST(a AS SMALLINT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS SMALLINT)" },
      );
    });

    it("TINYINT -> SMALLINT", () => {
      validateTranspile(
        "SELECT CAST(a AS TINYINT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS SMALLINT)" },
      );
    });

    it("FLOAT stays as FLOAT", () => {
      validateTranspile(
        "SELECT CAST(a AS FLOAT)",
        { read: "sqlglot", expected: "SELECT CAST(a AS FLOAT)" },
      );
    });

    it("DATE stays as DATE", () => {
      validateTranspile(
        "SELECT CAST(a AS DATE)",
        { read: "sqlglot", expected: "SELECT CAST(a AS DATE)" },
      );
    });

    it("DECIMAL stays as DECIMAL", () => {
      validateTranspile(
        "SELECT CAST(a AS DECIMAL)",
        { read: "sqlglot", expected: "SELECT CAST(a AS DECIMAL)" },
      );
    });

    it("VARCHAR stays as VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS VARCHAR)",
        { read: "sqlglot", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("CHAR stays as CHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS CHAR)",
        { read: "sqlglot", expected: "SELECT CAST(a AS CHAR)" },
      );
    });
  });

  // -------------------------------------------------------------------------
  // ILIKE (NOT supported in Fabric, converted to LIKE)
  // -------------------------------------------------------------------------

  describe("ILIKE", () => {
    it("ILIKE is converted to LIKE", () => {
      validateTranspile(
        "SELECT * FROM t WHERE name ILIKE '%test%'",
        { read: "sqlglot", expected: "SELECT * FROM t WHERE name LIKE '%test%'" },
      );
    });

    it("ILIKE from postgres is converted to LIKE", () => {
      validateTranspile(
        "SELECT * FROM t WHERE name ILIKE '%test%'",
        { read: "postgres", expected: "SELECT * FROM t WHERE name LIKE '%test%'" },
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
        readDialect: "fabric",
        writeDialect: "fabric",
      })[0];
      expect(result).toContain("SELECT");
    });

    it("block comment parses", () => {
      const result = transpile("SELECT /* comment */ a FROM t", {
        readDialect: "fabric",
        writeDialect: "fabric",
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

    it("boolean TRUE -> 1 (BIT)", () => {
      validateTranspile(
        "SELECT TRUE",
        { read: "sqlglot", expected: "SELECT 1" },
      );
    });

    it("boolean FALSE -> 0 (BIT)", () => {
      validateTranspile(
        "SELECT FALSE",
        { read: "sqlglot", expected: "SELECT 0" },
      );
    });

    it("boolean in WHERE from standard SQL", () => {
      validateTranspile(
        "SELECT * FROM t WHERE active = TRUE",
        { read: "sqlglot", expected: "SELECT * FROM t WHERE active = 1" },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Cross-dialect type transpilation
  // -------------------------------------------------------------------------

  describe("cross-dialect type transpilation", () => {
    it("postgres VARCHAR -> fabric VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS VARCHAR)",
        { read: "postgres", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("postgres TEXT -> fabric VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS TEXT)",
        { read: "postgres", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });

    it("fabric INT -> postgres INT", () => {
      validateTranspile(
        "SELECT CAST(a AS INT)",
        { write: "postgres", expected: "SELECT CAST(a AS INT)" },
      );
    });

    it("mysql BLOB -> fabric VARBINARY", () => {
      validateTranspile(
        "SELECT CAST(a AS BLOB)",
        { read: "mysql", expected: "SELECT CAST(a AS VARBINARY)" },
      );
    });

    it("fabric FLOAT -> databricks FLOAT", () => {
      validateTranspile(
        "SELECT CAST(a AS FLOAT)",
        { write: "databricks", expected: "SELECT CAST(a AS FLOAT)" },
      );
    });

    it("databricks BOOLEAN -> fabric BIT", () => {
      validateTranspile(
        "SELECT CAST(a AS BOOLEAN)",
        { read: "databricks", expected: "SELECT CAST(a AS BIT)" },
      );
    });

    it.todo("databricks STRING -> fabric VARCHAR (cross-dialect type normalization)");

    it.todo("fabric -> bigquery (BIT -> BOOL via standard type normalization)");

    it("snowflake VARCHAR -> fabric VARCHAR", () => {
      validateTranspile(
        "SELECT CAST(a AS VARCHAR)",
        { read: "snowflake", expected: "SELECT CAST(a AS VARCHAR)" },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Complex queries
  // -------------------------------------------------------------------------

  describe("complex queries", () => {
    it("CTE + JOIN + GROUP BY + HAVING + ORDER BY", () => {
      validateIdentity(
        "WITH cte AS (SELECT a, b FROM t1 INNER JOIN t2 ON t1.id = t2.id WHERE t1.active = 1) SELECT a, COUNT(*) AS cnt FROM cte GROUP BY a HAVING COUNT(*) > 5 ORDER BY cnt DESC",
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
    it.todo("TOP clause");
    it.todo("OFFSET FETCH");
    it.todo("MERGE statement");
    it.todo("CROSS APPLY / OUTER APPLY");
    it.todo("PIVOT / UNPIVOT");
    it.todo("INSERT INTO ... SELECT");
    it.todo("UPDATE with FROM clause");
    it.todo("DELETE with JOIN");
    it.todo("CREATE TABLE type mappings");
    it.todo("DECLARE variables");
    it.todo("TRY_CAST");
    it.todo("STRING_AGG function");
    it.todo("DATEADD / DATEDIFF functions");
    it.todo("FORMAT function");
    it.todo("GETDATE / SYSDATETIME functions");
    it.todo("AT TIME ZONE");
    it.todo("DATETIMEOFFSET precision capping");
    it.todo("Temporal type precision capping to 6 digits");
    it.todo("HASHBYTES function");
    it.todo("JSON_QUERY / JSON_VALUE functions");
    it.todo("INFORMATION_SCHEMA queries");
    it.todo("System functions (SCHEMA_NAME, SUSER_NAME, etc.)");
  });
});
