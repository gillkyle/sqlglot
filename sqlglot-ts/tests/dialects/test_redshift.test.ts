import { describe, it, expect } from "vitest";
import { transpile, Dialect } from "../../src/index.js";

/**
 * Validate that SQL round-trips through parse -> generate using the Redshift dialect.
 */
function validateIdentity(sql: string, writeSql?: string): void {
  const result = transpile(sql, { readDialect: "redshift", writeDialect: "redshift" })[0];
  expect(result).toBe(writeSql ?? sql);
}

/**
 * Validate transpilation from one dialect to another.
 */
function validateTranspile(
  sql: string,
  opts: {
    read?: string;
    write?: string;
    expected: string;
  },
): void {
  const result = transpile(sql, {
    readDialect: opts.read ?? "redshift",
    writeDialect: opts.write ?? "redshift",
  })[0];
  expect(result).toBe(opts.expected);
}

// =============================================================================
// Redshift dialect registration
// =============================================================================

describe("Redshift: dialect registration", () => {
  it("registers under 'redshift'", () => {
    const d = Dialect.getOrRaise("redshift");
    expect(d).toBeDefined();
    expect(d.constructor.name).toBe("Redshift");
  });

  it("uses double-quote for identifiers", () => {
    const d = Dialect.getOrRaise("redshift");
    expect(d.IDENTIFIER_START).toBe('"');
    expect(d.IDENTIFIER_END).toBe('"');
  });
});

// =============================================================================
// Redshift Identifier Quoting Tests
// =============================================================================

describe("Redshift: identifier quoting", () => {
  it("double-quoted identifiers round-trip", () => {
    validateIdentity('SELECT "a" FROM "b"');
  });

  it("double-quoted table.column round-trip", () => {
    validateIdentity('SELECT "a"."b" FROM "a"');
  });

  it("mixed quoted and unquoted identifiers", () => {
    validateIdentity('SELECT "a".b FROM a');
  });

  it("double-quoted alias", () => {
    validateIdentity('SELECT 1 AS "my alias"');
  });

  it("three-part name", () => {
    validateIdentity('SELECT "a"."b"."c"');
  });

  it("unquoted identifiers remain unquoted", () => {
    validateIdentity("SELECT a FROM b");
  });
});

// =============================================================================
// Redshift to/from other dialects transpilation
// =============================================================================

describe("Redshift: transpile to default dialect", () => {
  it("double-quoted identifiers pass through to default dialect", () => {
    validateTranspile('SELECT "a" FROM "b"', {
      read: "redshift",
      write: "",
      expected: 'SELECT "a" FROM "b"',
    });
  });

  it("unquoted identifiers pass through", () => {
    validateTranspile("SELECT a FROM b", {
      read: "redshift",
      write: "",
      expected: "SELECT a FROM b",
    });
  });
});

describe("Redshift: transpile from default dialect", () => {
  it("double-quoted identifiers stay double-quoted", () => {
    validateTranspile('SELECT "a" FROM "b"', {
      read: "",
      write: "redshift",
      expected: 'SELECT "a" FROM "b"',
    });
  });
});

describe("Redshift: transpile to/from MySQL", () => {
  it("MySQL backticks become double-quotes in Redshift", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "mysql",
      write: "redshift",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("Redshift double-quotes become backticks in MySQL", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "redshift",
      write: "mysql",
      expected: "SELECT `col` FROM `tbl`",
    });
  });
});

describe("Redshift: transpile to/from BigQuery", () => {
  it("BigQuery backticks become double-quotes in Redshift", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "bigquery",
      write: "redshift",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("Redshift double-quotes become backticks in BigQuery", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "redshift",
      write: "bigquery",
      expected: "SELECT `col` FROM `tbl`",
    });
  });
});

describe("Redshift: transpile to/from Postgres", () => {
  it("Postgres double-quotes stay in Redshift", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "postgres",
      write: "redshift",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("Redshift double-quotes stay in Postgres", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "redshift",
      write: "postgres",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });
});

// =============================================================================
// Redshift SELECT basics
// =============================================================================

describe("Redshift: SELECT basics", () => {
  it("SELECT * FROM test", () => {
    validateIdentity("SELECT * FROM test");
  });

  it("SELECT 1", () => {
    validateIdentity("SELECT 1");
  });

  it("SELECT with alias", () => {
    validateIdentity("SELECT a AS b FROM test");
  });

  it("SELECT with string literal", () => {
    validateIdentity("SELECT 'hello'");
  });

  it("SELECT with number", () => {
    validateIdentity("SELECT 42");
  });

  it("SELECT with multiple columns", () => {
    validateIdentity("SELECT a, b, c FROM test");
  });

  it("SELECT with expressions", () => {
    validateIdentity("SELECT a + b AS total FROM test");
  });

  it("SELECT with arithmetic", () => {
    validateIdentity("SELECT 1 + 2 * 3");
  });

  it("SELECT with comparison", () => {
    validateIdentity("SELECT a > 1 FROM test");
  });
});

// =============================================================================
// Redshift WHERE clause
// =============================================================================

describe("Redshift: WHERE clause", () => {
  it("simple WHERE", () => {
    validateIdentity("SELECT a FROM test WHERE a = 1");
  });

  it("WHERE with AND", () => {
    validateIdentity("SELECT a FROM test WHERE a = 1 AND b = 2");
  });

  it("WHERE with OR", () => {
    validateIdentity("SELECT a FROM test WHERE a = 1 OR b = 2");
  });

  it("WHERE with IN", () => {
    validateIdentity("SELECT a FROM test WHERE a IN (1, 2, 3)");
  });

  it("WHERE with BETWEEN", () => {
    validateIdentity("SELECT a FROM test WHERE a BETWEEN 1 AND 10");
  });

  it("WHERE with LIKE", () => {
    validateIdentity("SELECT a FROM test WHERE a LIKE '%test%'");
  });

  it("WHERE with ILIKE (Redshift supports ILIKE)", () => {
    validateIdentity("SELECT a FROM test WHERE a ILIKE '%test%'");
  });

  it("WHERE with NOT", () => {
    validateIdentity("SELECT a FROM test WHERE NOT a = 1");
  });

  it("WHERE with IS NULL", () => {
    validateIdentity("SELECT a FROM test WHERE a IS NULL");
  });

  it("WHERE with subquery IN", () => {
    validateIdentity("SELECT a FROM test WHERE a IN (SELECT b FROM other)");
  });
});

// =============================================================================
// Redshift GROUP BY, HAVING, ORDER BY
// =============================================================================

describe("Redshift: GROUP BY, HAVING, ORDER BY", () => {
  it("GROUP BY", () => {
    validateIdentity("SELECT a, COUNT(*) FROM test GROUP BY a");
  });

  it("GROUP BY with HAVING", () => {
    validateIdentity(
      "SELECT a, COUNT(*) FROM test GROUP BY a HAVING COUNT(*) > 1",
    );
  });

  it("ORDER BY", () => {
    validateIdentity("SELECT a FROM test ORDER BY a");
  });

  it("ORDER BY DESC", () => {
    validateIdentity("SELECT a FROM test ORDER BY a DESC");
  });

  it("ORDER BY multiple", () => {
    validateIdentity("SELECT a, b FROM test ORDER BY a, b DESC");
  });

  it("ORDER BY NULLS FIRST", () => {
    validateIdentity("SELECT a FROM test ORDER BY a NULLS FIRST");
  });

  it("ORDER BY NULLS LAST", () => {
    validateIdentity("SELECT a FROM test ORDER BY a NULLS LAST");
  });
});

// =============================================================================
// Redshift JOINs
// =============================================================================

describe("Redshift: JOINs", () => {
  it("JOIN ... ON", () => {
    validateIdentity("SELECT 1 FROM a JOIN b ON a.x = b.x");
  });

  it("INNER JOIN", () => {
    validateIdentity("SELECT 1 FROM a INNER JOIN b ON a.x = b.x");
  });

  it("CROSS JOIN", () => {
    validateIdentity("SELECT 1 FROM a CROSS JOIN b ON a.x = b.x");
  });

  it("JOIN ... USING", () => {
    validateIdentity("SELECT 1 FROM a JOIN b USING (x)");
  });

  it("multiple JOINs", () => {
    validateIdentity(
      "SELECT 1 FROM a JOIN b ON a.x = b.x JOIN c ON b.y = c.y",
    );
  });

  it("comma join", () => {
    validateIdentity("SELECT * FROM a, b");
  });
});

// =============================================================================
// Redshift Set Operations
// =============================================================================

describe("Redshift: set operations", () => {
  it("UNION", () => {
    validateIdentity("SELECT 1 UNION SELECT 2");
  });

  it("UNION ALL", () => {
    validateIdentity("SELECT 1 UNION ALL SELECT 2");
  });

  it("EXCEPT", () => {
    validateIdentity("SELECT 1 EXCEPT SELECT 2");
  });

  it("INTERSECT", () => {
    validateIdentity("SELECT 1 INTERSECT SELECT 2");
  });
});

// =============================================================================
// Redshift CTEs
// =============================================================================

describe("Redshift: CTEs", () => {
  it("simple CTE", () => {
    validateIdentity("WITH cte AS (SELECT 1) SELECT * FROM cte");
  });

  it("multiple CTEs", () => {
    validateIdentity(
      "WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a",
    );
  });

  it("CTE with UNION", () => {
    validateIdentity(
      "WITH cte AS (SELECT 1) SELECT * FROM cte UNION ALL SELECT 2",
    );
  });
});

// =============================================================================
// Redshift CASE WHEN
// =============================================================================

describe("Redshift: CASE WHEN", () => {
  it("simple CASE WHEN", () => {
    validateIdentity(
      "SELECT CASE WHEN a > 1 THEN 'yes' ELSE 'no' END FROM test",
    );
  });

  it("CASE with operand", () => {
    validateIdentity("SELECT CASE a WHEN 1 THEN 'one' WHEN 2 THEN 'two' ELSE 'other' END");
  });
});

// =============================================================================
// Redshift CAST with type mappings
// =============================================================================

describe("Redshift: CAST type mappings", () => {
  it("INT -> INTEGER", () => {
    validateTranspile("SELECT CAST(a AS INT)", {
      write: "redshift",
      expected: "SELECT CAST(a AS INTEGER)",
    });
  });

  it("TINYINT -> SMALLINT (Postgres-inherited)", () => {
    validateTranspile("SELECT CAST(a AS TINYINT)", {
      write: "redshift",
      expected: "SELECT CAST(a AS SMALLINT)",
    });
  });

  it("FLOAT -> REAL (Postgres-inherited)", () => {
    validateTranspile("SELECT CAST(a AS FLOAT)", {
      write: "redshift",
      expected: "SELECT CAST(a AS REAL)",
    });
  });

  it("DOUBLE -> DOUBLE PRECISION (Postgres-inherited)", () => {
    validateTranspile("SELECT CAST(a AS DOUBLE)", {
      write: "redshift",
      expected: "SELECT CAST(a AS DOUBLE PRECISION)",
    });
  });

  it("BINARY -> VARBYTE", () => {
    validateTranspile("SELECT CAST(a AS BINARY)", {
      write: "redshift",
      expected: "SELECT CAST(a AS VARBYTE)",
    });
  });

  it("VARBINARY -> VARBYTE", () => {
    validateTranspile("SELECT CAST(a AS VARBINARY)", {
      write: "redshift",
      expected: "SELECT CAST(a AS VARBYTE)",
    });
  });

  it("BLOB -> VARBYTE", () => {
    validateTranspile("SELECT CAST(a AS BLOB)", {
      write: "redshift",
      expected: "SELECT CAST(a AS VARBYTE)",
    });
  });

  it("DATETIME -> TIMESTAMP (Postgres-inherited)", () => {
    validateTranspile("SELECT CAST(a AS DATETIME)", {
      write: "redshift",
      expected: "SELECT CAST(a AS TIMESTAMP)",
    });
  });

  it("BIGINT stays BIGINT", () => {
    validateTranspile("SELECT CAST(a AS BIGINT)", {
      write: "redshift",
      expected: "SELECT CAST(a AS BIGINT)",
    });
  });

  it("VARCHAR stays VARCHAR", () => {
    validateTranspile("SELECT CAST(a AS VARCHAR)", {
      write: "redshift",
      expected: "SELECT CAST(a AS VARCHAR)",
    });
  });

  it("TEXT stays TEXT", () => {
    validateTranspile("SELECT CAST(a AS TEXT)", {
      write: "redshift",
      expected: "SELECT CAST(a AS TEXT)",
    });
  });

  it("BOOLEAN stays BOOLEAN", () => {
    validateTranspile("SELECT CAST(a AS BOOLEAN)", {
      write: "redshift",
      expected: "SELECT CAST(a AS BOOLEAN)",
    });
  });

  it("DATE stays DATE", () => {
    validateTranspile("SELECT CAST(a AS DATE)", {
      write: "redshift",
      expected: "SELECT CAST(a AS DATE)",
    });
  });

  it("VARCHAR with length preserved", () => {
    validateTranspile("SELECT CAST(a AS VARCHAR(256))", {
      write: "redshift",
      expected: "SELECT CAST(a AS VARCHAR(256))",
    });
  });

  it("DECIMAL with precision preserved", () => {
    validateTranspile("SELECT CAST(a AS DECIMAL(18, 2))", {
      write: "redshift",
      expected: "SELECT CAST(a AS DECIMAL(18, 2))",
    });
  });
});

// =============================================================================
// Redshift: ILIKE support (native)
// =============================================================================

describe("Redshift: ILIKE support", () => {
  it("ILIKE round-trips natively", () => {
    validateIdentity("SELECT a FROM test WHERE a ILIKE '%foo%'");
  });

  it("ILIKE from postgres to Redshift preserves ILIKE", () => {
    validateTranspile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      read: "postgres",
      write: "redshift",
      expected: "SELECT a FROM t WHERE a ILIKE '%test%'",
    });
  });

  it("ILIKE from Redshift to MySQL becomes LIKE", () => {
    validateTranspile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      read: "redshift",
      write: "mysql",
      expected: "SELECT a FROM t WHERE a LIKE '%test%'",
    });
  });

  it("ILIKE from Redshift to BigQuery becomes LIKE", () => {
    validateTranspile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      read: "redshift",
      write: "bigquery",
      expected: "SELECT a FROM t WHERE a LIKE '%test%'",
    });
  });

  it("ILIKE from Redshift to SQLite becomes LIKE", () => {
    validateTranspile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      read: "redshift",
      write: "sqlite",
      expected: "SELECT a FROM t WHERE a LIKE '%test%'",
    });
  });
});

// =============================================================================
// Redshift Aggregate Functions
// =============================================================================

describe("Redshift: aggregate functions", () => {
  it("COUNT(*)", () => {
    validateIdentity("SELECT COUNT(*) FROM test");
  });

  it("SUM", () => {
    validateIdentity("SELECT SUM(a) FROM test");
  });

  it("AVG", () => {
    validateIdentity("SELECT AVG(a) FROM test");
  });

  it("MIN", () => {
    validateIdentity("SELECT MIN(a) FROM test");
  });

  it("MAX", () => {
    validateIdentity("SELECT MAX(a) FROM test");
  });

  it("COALESCE", () => {
    validateIdentity("SELECT COALESCE(a, b, c) FROM test");
  });

  it("NULLIF", () => {
    validateIdentity("SELECT NULLIF(a, b) FROM test");
  });
});

// =============================================================================
// Redshift Window Functions
// =============================================================================

describe("Redshift: window functions", () => {
  it("ROW_NUMBER", () => {
    validateIdentity("SELECT ROW_NUMBER() OVER (ORDER BY a) FROM test");
  });

  it("RANK with PARTITION BY", () => {
    validateIdentity(
      "SELECT RANK() OVER (PARTITION BY a ORDER BY b) FROM test",
    );
  });

  it("SUM window", () => {
    validateIdentity("SELECT SUM(a) OVER (PARTITION BY b) FROM test");
  });
});

// =============================================================================
// Redshift: Subqueries
// =============================================================================

describe("Redshift: subqueries", () => {
  it("subquery in FROM", () => {
    validateIdentity("SELECT a FROM (SELECT a FROM test) AS t");
  });

  it("subquery in WHERE", () => {
    validateIdentity(
      "SELECT a FROM test WHERE a > (SELECT MAX(b) FROM other)",
    );
  });

  it("subquery in IN", () => {
    validateIdentity("SELECT a FROM test WHERE a IN (SELECT b FROM other)");
  });
});

// =============================================================================
// Redshift: String and numeric literals
// =============================================================================

describe("Redshift: string and numeric literals", () => {
  it("string literal", () => {
    validateIdentity("SELECT 'hello'");
  });

  it("escaped quote in string", () => {
    validateIdentity("SELECT 'it''s'");
  });

  it("numeric literal", () => {
    validateIdentity("SELECT 42");
  });

  it("float literal", () => {
    validateIdentity("SELECT 3.14");
  });

  it("NULL literal", () => {
    validateIdentity("SELECT NULL");
  });

  it("TRUE literal", () => {
    validateIdentity("SELECT TRUE");
  });

  it("FALSE literal", () => {
    validateIdentity("SELECT FALSE");
  });
});

// =============================================================================
// Redshift: Complex queries
// =============================================================================

describe("Redshift: complex queries", () => {
  it("complex SELECT with WHERE, GROUP BY, HAVING, ORDER BY", () => {
    validateIdentity(
      "SELECT a, COUNT(*) FROM test WHERE b > 1 GROUP BY a HAVING COUNT(*) > 2 ORDER BY a",
    );
  });

  it("nested subquery", () => {
    validateIdentity(
      "SELECT a FROM (SELECT a FROM (SELECT a FROM test) AS t1) AS t2",
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

// =============================================================================
// Redshift: NOT variations
// =============================================================================

describe("Redshift: NOT variations", () => {
  it("NOT IN (parser generates NOT x IN form)", () => {
    validateIdentity(
      "SELECT a FROM test WHERE a NOT IN (1, 2, 3)",
      "SELECT a FROM test WHERE NOT a IN (1, 2, 3)",
    );
  });

  it("NOT BETWEEN (parser generates NOT x BETWEEN form)", () => {
    validateIdentity(
      "SELECT a FROM test WHERE a NOT BETWEEN 1 AND 10",
      "SELECT a FROM test WHERE NOT a BETWEEN 1 AND 10",
    );
  });

  it("NOT LIKE (parser generates NOT x LIKE form)", () => {
    validateIdentity(
      "SELECT a FROM test WHERE a NOT LIKE '%test%'",
      "SELECT a FROM test WHERE NOT a LIKE '%test%'",
    );
  });
});

// =============================================================================
// Redshift: Comment handling
// =============================================================================

describe("Redshift: comment handling", () => {
  it("single line comment with --", () => {
    const result = transpile("SELECT 1 -- comment", {
      readDialect: "redshift",
      writeDialect: "redshift",
    })[0];
    expect(result).toBe("SELECT 1");
  });

  it("block comment /* */", () => {
    const result = transpile("SELECT /* comment */ 1", {
      readDialect: "redshift",
      writeDialect: "redshift",
    })[0];
    expect(result).toBe("SELECT 1");
  });
});

// =============================================================================
// Redshift: NULL and BOOLEAN handling
// =============================================================================

describe("Redshift: NULL and BOOLEAN", () => {
  it("NULL literal", () => {
    validateIdentity("SELECT NULL");
  });

  it("TRUE literal", () => {
    validateIdentity("SELECT TRUE");
  });

  it("FALSE literal", () => {
    validateIdentity("SELECT FALSE");
  });

  it("IS NULL", () => {
    validateIdentity("SELECT a IS NULL FROM test");
  });

  it("IS TRUE", () => {
    validateIdentity("SELECT a IS TRUE FROM test");
  });

  it("IS FALSE", () => {
    validateIdentity("SELECT a IS FALSE FROM test");
  });
});

// =============================================================================
// Redshift: Features not yet implemented (marked as todo)
// =============================================================================

describe("Redshift: features not yet implemented", () => {
  it.todo("DISTKEY / SORTKEY in CREATE TABLE");
  it.todo("ENCODE column compression");
  it.todo("SUPER data type");
  it.todo("COPY / UNLOAD commands");
  it.todo("CREATE TABLE / ALTER TABLE / DROP TABLE");
  it.todo("INSERT / UPDATE / DELETE");
  it.todo("CREATE EXTERNAL TABLE (Spectrum)");
  it.todo("APPROXIMATE COUNT(DISTINCT ...)");
  it.todo("LISTAGG function");
  it.todo("CONVERT_TIMEZONE function");
  it.todo("DATEADD / DATEDIFF functions");
  it.todo("GETDATE() function");
  it.todo("JSON_EXTRACT_PATH_TEXT");
  it.todo("|| string concatenation operator");
  it.todo("PIVOT / UNPIVOT");
  it.todo("Window functions with ROWS/RANGE frames");
  it.todo("LATERAL joins");
  it.todo("WITH NO SCHEMA BINDING (late-binding views)");
});
