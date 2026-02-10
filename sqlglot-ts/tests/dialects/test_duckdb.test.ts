import { describe, it, expect } from "vitest";
import { transpile, Dialect } from "../../src/index.js";

/**
 * Validate that SQL round-trips through parse -> generate using the DuckDB dialect.
 * If writeSql is provided, the generated output is expected to match writeSql.
 * Otherwise, the output should match the input sql exactly.
 */
function validateIdentity(sql: string, writeSql?: string): void {
  const result = transpile(sql, { readDialect: "duckdb", writeDialect: "duckdb" })[0];
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
    readDialect: opts.read ?? "duckdb",
    writeDialect: opts.write ?? "duckdb",
  })[0];
  expect(result).toBe(opts.expected);
}

// =============================================================================
// DuckDB dialect registration
// =============================================================================

describe("DuckDB: dialect registration", () => {
  it("registers under 'duckdb'", () => {
    const d = Dialect.getOrRaise("duckdb");
    expect(d).toBeDefined();
    expect(d.constructor.name).toBe("DuckDB");
  });

  it("uses double-quote for identifiers", () => {
    const d = Dialect.getOrRaise("duckdb");
    expect(d.IDENTIFIER_START).toBe('"');
    expect(d.IDENTIFIER_END).toBe('"');
  });
});

// =============================================================================
// DuckDB Identifier Quoting Tests
// =============================================================================

describe("DuckDB: identifier quoting with double-quotes", () => {
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
// DuckDB to/from other dialects transpilation
// =============================================================================

describe("DuckDB: transpile DuckDB quoted identifiers to default dialect", () => {
  it("double-quoted identifiers pass through to default dialect", () => {
    validateTranspile('SELECT "a" FROM "b"', {
      read: "duckdb",
      write: "",
      expected: 'SELECT "a" FROM "b"',
    });
  });

  it("unquoted identifiers pass through", () => {
    validateTranspile("SELECT a FROM b", {
      read: "duckdb",
      write: "",
      expected: "SELECT a FROM b",
    });
  });
});

describe("DuckDB: transpile default dialect to DuckDB", () => {
  it("double-quoted identifiers stay double-quoted in DuckDB", () => {
    validateTranspile('SELECT "a" FROM "b"', {
      read: "",
      write: "duckdb",
      expected: 'SELECT "a" FROM "b"',
    });
  });
});

// =============================================================================
// DuckDB SELECT basics
// =============================================================================

describe("DuckDB: SELECT basics", () => {
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
});

// =============================================================================
// DuckDB WHERE clause
// =============================================================================

describe("DuckDB: WHERE clause", () => {
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

  it("WHERE with ILIKE (DuckDB supports ILIKE)", () => {
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
// DuckDB GROUP BY, HAVING, ORDER BY
// =============================================================================

describe("DuckDB: GROUP BY, HAVING, ORDER BY", () => {
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
// DuckDB JOINs
// =============================================================================

describe("DuckDB: JOINs", () => {
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
// DuckDB Set Operations
// =============================================================================

describe("DuckDB: set operations", () => {
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
// DuckDB CTEs
// =============================================================================

describe("DuckDB: CTEs", () => {
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
// DuckDB CASE WHEN
// =============================================================================

describe("DuckDB: CASE WHEN", () => {
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
// DuckDB CAST with type mappings
// =============================================================================

describe("DuckDB: CAST type mappings", () => {
  it("BINARY -> BLOB", () => {
    validateTranspile("SELECT CAST(a AS BINARY)", {
      write: "duckdb",
      expected: "SELECT CAST(a AS BLOB)",
    });
  });

  it("VARBINARY -> BLOB", () => {
    validateTranspile("SELECT CAST(a AS VARBINARY)", {
      write: "duckdb",
      expected: "SELECT CAST(a AS BLOB)",
    });
  });

  it("CHAR -> TEXT", () => {
    validateTranspile("SELECT CAST(a AS CHAR)", {
      write: "duckdb",
      expected: "SELECT CAST(a AS TEXT)",
    });
  });

  it("NCHAR -> TEXT", () => {
    validateTranspile("SELECT CAST(a AS NCHAR)", {
      write: "duckdb",
      expected: "SELECT CAST(a AS TEXT)",
    });
  });

  it("NVARCHAR -> TEXT", () => {
    validateTranspile("SELECT CAST(a AS NVARCHAR)", {
      write: "duckdb",
      expected: "SELECT CAST(a AS TEXT)",
    });
  });

  it("VARCHAR -> TEXT", () => {
    validateTranspile("SELECT CAST(a AS VARCHAR)", {
      write: "duckdb",
      expected: "SELECT CAST(a AS TEXT)",
    });
  });

  it("FLOAT -> REAL", () => {
    validateTranspile("SELECT CAST(a AS FLOAT)", {
      write: "duckdb",
      expected: "SELECT CAST(a AS REAL)",
    });
  });

  it("DATETIME -> TIMESTAMP", () => {
    validateTranspile("SELECT CAST(a AS DATETIME)", {
      write: "duckdb",
      expected: "SELECT CAST(a AS TIMESTAMP)",
    });
  });

  it("INT stays INT", () => {
    validateTranspile("SELECT CAST(a AS INT)", {
      write: "duckdb",
      expected: "SELECT CAST(a AS INT)",
    });
  });

  it("BIGINT stays BIGINT", () => {
    validateTranspile("SELECT CAST(a AS BIGINT)", {
      write: "duckdb",
      expected: "SELECT CAST(a AS BIGINT)",
    });
  });

  it("DOUBLE stays DOUBLE", () => {
    validateTranspile("SELECT CAST(a AS DOUBLE)", {
      write: "duckdb",
      expected: "SELECT CAST(a AS DOUBLE)",
    });
  });

  it("BOOLEAN stays BOOLEAN", () => {
    validateTranspile("SELECT CAST(a AS BOOLEAN)", {
      write: "duckdb",
      expected: "SELECT CAST(a AS BOOLEAN)",
    });
  });

  it("TEXT stays TEXT", () => {
    validateTranspile("SELECT CAST(a AS TEXT)", {
      write: "duckdb",
      expected: "SELECT CAST(a AS TEXT)",
    });
  });

  it("DATE stays DATE", () => {
    validateTranspile("SELECT CAST(a AS DATE)", {
      write: "duckdb",
      expected: "SELECT CAST(a AS DATE)",
    });
  });
});

// =============================================================================
// DuckDB: TRY_CAST support
// =============================================================================

describe("DuckDB: TRY_CAST", () => {
  it("TRY_CAST round-trips", () => {
    validateIdentity("SELECT TRY_CAST(a AS INT) FROM test");
  });

  it.todo("TRY_CAST with type mapping (requires dedicated TRY_CAST parser support)");
});

// =============================================================================
// DuckDB Aggregate Functions
// =============================================================================

describe("DuckDB: aggregate functions", () => {
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
// DuckDB Window Functions
// =============================================================================

describe("DuckDB: window functions", () => {
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
// DuckDB: ILIKE support (native)
// =============================================================================

describe("DuckDB: ILIKE support", () => {
  it("ILIKE round-trips natively", () => {
    validateIdentity("SELECT a FROM test WHERE a ILIKE '%foo%'");
  });

  it("ILIKE from postgres to DuckDB preserves ILIKE", () => {
    validateTranspile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      read: "postgres",
      write: "duckdb",
      expected: "SELECT a FROM t WHERE a ILIKE '%test%'",
    });
  });

  it("ILIKE from default to DuckDB preserves ILIKE", () => {
    validateTranspile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      read: "",
      write: "duckdb",
      expected: "SELECT a FROM t WHERE a ILIKE '%test%'",
    });
  });
});

// =============================================================================
// DuckDB: Subqueries
// =============================================================================

describe("DuckDB: subqueries", () => {
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
// DuckDB: String and numeric literals
// =============================================================================

describe("DuckDB: string and numeric literals", () => {
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
// DuckDB: Complex queries
// =============================================================================

describe("DuckDB: complex queries", () => {
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
// DuckDB: Cross-dialect transpilation
// =============================================================================

describe("DuckDB: cross-dialect transpilation", () => {
  it("simple SELECT from DuckDB to default", () => {
    validateTranspile("SELECT a FROM test", {
      read: "duckdb",
      write: "",
      expected: "SELECT a FROM test",
    });
  });

  it("simple SELECT from default to DuckDB", () => {
    validateTranspile("SELECT a FROM test", {
      read: "",
      write: "duckdb",
      expected: "SELECT a FROM test",
    });
  });

  it("DuckDB to Postgres", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "duckdb",
      write: "postgres",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("DuckDB to MySQL", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "duckdb",
      write: "mysql",
      expected: "SELECT `col` FROM `tbl`",
    });
  });

  it("DuckDB to BigQuery", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "duckdb",
      write: "bigquery",
      expected: "SELECT `col` FROM `tbl`",
    });
  });

  it("MySQL to DuckDB", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "mysql",
      write: "duckdb",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("BigQuery to DuckDB", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "bigquery",
      write: "duckdb",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("Postgres to DuckDB", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "postgres",
      write: "duckdb",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("ILIKE from DuckDB to MySQL (ILIKE -> LIKE)", () => {
    validateTranspile("SELECT a FROM t WHERE a ILIKE '%x%'", {
      read: "duckdb",
      write: "mysql",
      expected: "SELECT a FROM t WHERE a LIKE '%x%'",
    });
  });

  it("ILIKE from DuckDB to BigQuery (ILIKE -> LIKE)", () => {
    validateTranspile("SELECT a FROM t WHERE a ILIKE '%x%'", {
      read: "duckdb",
      write: "bigquery",
      expected: "SELECT a FROM t WHERE a LIKE '%x%'",
    });
  });

  it("CAST type mapping from default to DuckDB", () => {
    validateTranspile("SELECT CAST(x AS VARCHAR)", {
      read: "",
      write: "duckdb",
      expected: "SELECT CAST(x AS TEXT)",
    });
  });

  it("CAST type mapping from DuckDB to Postgres", () => {
    validateTranspile("SELECT CAST(x AS FLOAT)", {
      read: "",
      write: "duckdb",
      expected: "SELECT CAST(x AS REAL)",
    });
  });
});

// =============================================================================
// DuckDB: NOT variations
// =============================================================================

describe("DuckDB: NOT variations", () => {
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
// DuckDB: Comment handling
// =============================================================================

describe("DuckDB: comment handling", () => {
  it("single line comment with --", () => {
    const result = transpile("SELECT 1 -- comment", {
      readDialect: "duckdb",
      writeDialect: "duckdb",
    })[0];
    expect(result).toBe("SELECT 1");
  });

  it("block comment /* */", () => {
    const result = transpile("SELECT /* comment */ 1", {
      readDialect: "duckdb",
      writeDialect: "duckdb",
    })[0];
    expect(result).toBe("SELECT 1");
  });
});

// =============================================================================
// DuckDB: NULL and BOOLEAN handling
// =============================================================================

describe("DuckDB: NULL and BOOLEAN", () => {
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
// DuckDB: Features not yet implemented (marked as todo)
// =============================================================================

describe("DuckDB: features not yet implemented", () => {
  it.todo("LIST / ARRAY type and functions");
  it.todo("STRUCT type and functions");
  it.todo("MAP type and functions");
  it.todo("ENUM type");
  it.todo("CREATE TABLE / ALTER TABLE / DROP TABLE");
  it.todo("INSERT / UPDATE / DELETE");
  it.todo("COPY ... TO / FROM");
  it.todo("PIVOT / UNPIVOT");
  it.todo("QUALIFY clause");
  it.todo("EXCLUDE / REPLACE / RENAME in SELECT *");
  it.todo("POSITIONAL JOIN");
  it.todo("SAMPLE / TABLESAMPLE");
  it.todo("RECURSIVE CTEs");
  it.todo("LATERAL joins");
  it.todo("GENERATE_SERIES");
  it.todo("String concatenation with || operator");
  it.todo("LIST_AGG / STRING_AGG");
  it.todo("EPOCH functions");
  it.todo("Window functions with ROWS/RANGE/GROUPS frames");
  it.todo("Dollar-quoted strings");
  it.todo("DuckDB-specific date functions (DATE_PART, DATE_TRUNC)");
});
