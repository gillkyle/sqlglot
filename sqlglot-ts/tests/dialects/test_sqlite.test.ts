import { describe, it, expect } from "vitest";
import { transpile, Dialect } from "../../src/index.js";

/**
 * Validate that SQL round-trips through parse -> generate using the SQLite dialect.
 */
function validateIdentity(sql: string, writeSql?: string): void {
  const result = transpile(sql, { readDialect: "sqlite", writeDialect: "sqlite" })[0];
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
    readDialect: opts.read ?? "sqlite",
    writeDialect: opts.write ?? "sqlite",
  })[0];
  expect(result).toBe(opts.expected);
}

// =============================================================================
// SQLite dialect registration
// =============================================================================

describe("SQLite: dialect registration", () => {
  it("registers under 'sqlite'", () => {
    const d = Dialect.getOrRaise("sqlite");
    expect(d).toBeDefined();
    expect(d.constructor.name).toBe("SQLite");
  });

  it("uses double-quote for identifiers", () => {
    const d = Dialect.getOrRaise("sqlite");
    expect(d.IDENTIFIER_START).toBe('"');
    expect(d.IDENTIFIER_END).toBe('"');
  });
});

// =============================================================================
// SQLite Identifier Quoting Tests
// =============================================================================

describe("SQLite: identifier quoting", () => {
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

  it("unquoted identifiers remain unquoted", () => {
    validateIdentity("SELECT a FROM b");
  });

  it("backtick identifiers from SQLite read become double-quoted", () => {
    // SQLite tokenizer accepts backticks as identifier delimiters
    const result = transpile("SELECT `a` FROM `b`", {
      readDialect: "sqlite",
      writeDialect: "sqlite",
    })[0];
    expect(result).toBe('SELECT "a" FROM "b"');
  });

  it("bracket identifiers from SQLite read become double-quoted", () => {
    // SQLite tokenizer accepts square brackets as identifier delimiters
    const result = transpile("SELECT [a] FROM [b]", {
      readDialect: "sqlite",
      writeDialect: "sqlite",
    })[0];
    expect(result).toBe('SELECT "a" FROM "b"');
  });
});

// =============================================================================
// SQLite to/from other dialects transpilation
// =============================================================================

describe("SQLite: transpile to default dialect", () => {
  it("double-quoted identifiers pass through to default dialect", () => {
    validateTranspile('SELECT "a" FROM "b"', {
      read: "sqlite",
      write: "",
      expected: 'SELECT "a" FROM "b"',
    });
  });

  it("unquoted identifiers pass through", () => {
    validateTranspile("SELECT a FROM b", {
      read: "sqlite",
      write: "",
      expected: "SELECT a FROM b",
    });
  });
});

describe("SQLite: transpile from default dialect", () => {
  it("double-quoted identifiers stay double-quoted", () => {
    validateTranspile('SELECT "a" FROM "b"', {
      read: "",
      write: "sqlite",
      expected: 'SELECT "a" FROM "b"',
    });
  });
});

describe("SQLite: transpile to/from MySQL", () => {
  it("MySQL backticks become double-quotes in SQLite", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "mysql",
      write: "sqlite",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("SQLite double-quotes become backticks in MySQL", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "sqlite",
      write: "mysql",
      expected: "SELECT `col` FROM `tbl`",
    });
  });
});

describe("SQLite: transpile to/from Postgres", () => {
  it("Postgres double-quotes stay double-quotes in SQLite", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "postgres",
      write: "sqlite",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("SQLite double-quotes stay double-quotes in Postgres", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "sqlite",
      write: "postgres",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });
});

describe("SQLite: transpile to/from BigQuery", () => {
  it("BigQuery backticks become double-quotes in SQLite", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "bigquery",
      write: "sqlite",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("SQLite double-quotes become backticks in BigQuery", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "sqlite",
      write: "bigquery",
      expected: "SELECT `col` FROM `tbl`",
    });
  });
});

describe("SQLite: transpile to/from DuckDB", () => {
  it("DuckDB double-quotes stay double-quotes in SQLite", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "duckdb",
      write: "sqlite",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("SQLite double-quotes stay double-quotes in DuckDB", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "sqlite",
      write: "duckdb",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });
});

// =============================================================================
// SQLite SELECT basics
// =============================================================================

describe("SQLite: SELECT basics", () => {
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
// SQLite WHERE clause
// =============================================================================

describe("SQLite: WHERE clause", () => {
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

  it("WHERE with NOT", () => {
    validateIdentity("SELECT a FROM test WHERE NOT a = 1");
  });

  it("WHERE with IS NULL", () => {
    validateIdentity("SELECT a FROM test WHERE a IS NULL");
  });

  it("WHERE with IS NOT NULL", () => {
    validateIdentity("SELECT a FROM test WHERE NOT a IS NULL");
  });

  it("WHERE with subquery IN", () => {
    validateIdentity("SELECT a FROM test WHERE a IN (SELECT b FROM other)");
  });
});

// =============================================================================
// SQLite GROUP BY, HAVING, ORDER BY
// =============================================================================

describe("SQLite: GROUP BY, HAVING, ORDER BY", () => {
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

  it("GROUP BY + ORDER BY", () => {
    validateIdentity(
      "SELECT a, COUNT(*) FROM test GROUP BY a ORDER BY a",
    );
  });
});

// =============================================================================
// SQLite JOINs
// =============================================================================

describe("SQLite: JOINs", () => {
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
// SQLite Set Operations
// =============================================================================

describe("SQLite: set operations", () => {
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
// SQLite CTEs
// =============================================================================

describe("SQLite: CTEs", () => {
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
// SQLite CASE WHEN
// =============================================================================

describe("SQLite: CASE WHEN", () => {
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
// SQLite CAST with type mappings
// =============================================================================

describe("SQLite: CAST type mappings", () => {
  it("BOOLEAN -> INTEGER", () => {
    validateTranspile("SELECT CAST(a AS BOOLEAN)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS INTEGER)",
    });
  });

  it("TINYINT -> INTEGER", () => {
    validateTranspile("SELECT CAST(a AS TINYINT)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS INTEGER)",
    });
  });

  it("SMALLINT -> INTEGER", () => {
    validateTranspile("SELECT CAST(a AS SMALLINT)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS INTEGER)",
    });
  });

  it("INT -> INTEGER", () => {
    validateTranspile("SELECT CAST(a AS INT)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS INTEGER)",
    });
  });

  it("BIGINT -> INTEGER", () => {
    validateTranspile("SELECT CAST(a AS BIGINT)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS INTEGER)",
    });
  });

  it("FLOAT -> REAL", () => {
    validateTranspile("SELECT CAST(a AS FLOAT)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS REAL)",
    });
  });

  it("DOUBLE -> REAL", () => {
    validateTranspile("SELECT CAST(a AS DOUBLE)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS REAL)",
    });
  });

  it("DECIMAL -> REAL", () => {
    validateTranspile("SELECT CAST(a AS DECIMAL)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS REAL)",
    });
  });

  it("CHAR -> TEXT", () => {
    validateTranspile("SELECT CAST(a AS CHAR)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS TEXT)",
    });
  });

  it("VARCHAR -> TEXT", () => {
    validateTranspile("SELECT CAST(a AS VARCHAR)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS TEXT)",
    });
  });

  it("NCHAR -> TEXT", () => {
    validateTranspile("SELECT CAST(a AS NCHAR)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS TEXT)",
    });
  });

  it("NVARCHAR -> TEXT", () => {
    validateTranspile("SELECT CAST(a AS NVARCHAR)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS TEXT)",
    });
  });

  it("BINARY -> BLOB", () => {
    validateTranspile("SELECT CAST(a AS BINARY)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS BLOB)",
    });
  });

  it("VARBINARY -> BLOB", () => {
    validateTranspile("SELECT CAST(a AS VARBINARY)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS BLOB)",
    });
  });

  it("DATETIME -> TEXT", () => {
    validateTranspile("SELECT CAST(a AS DATETIME)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS TEXT)",
    });
  });

  it("TIMESTAMP -> TEXT", () => {
    validateTranspile("SELECT CAST(a AS TIMESTAMP)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS TEXT)",
    });
  });

  it("DATE -> TEXT", () => {
    validateTranspile("SELECT CAST(a AS DATE)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS TEXT)",
    });
  });

  it("TEXT stays TEXT", () => {
    validateTranspile("SELECT CAST(a AS TEXT)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS TEXT)",
    });
  });

  it("INTEGER stays INTEGER", () => {
    validateTranspile("SELECT CAST(a AS INTEGER)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS INTEGER)",
    });
  });

  it("REAL stays REAL", () => {
    validateTranspile("SELECT CAST(a AS REAL)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS REAL)",
    });
  });

  it("BLOB stays BLOB", () => {
    validateTranspile("SELECT CAST(a AS BLOB)", {
      write: "sqlite",
      expected: "SELECT CAST(a AS BLOB)",
    });
  });

  it("type parameters are dropped for mapped types", () => {
    // VARCHAR(100) -> TEXT (no parameters)
    validateTranspile("SELECT CAST(a AS VARCHAR(100))", {
      write: "sqlite",
      expected: "SELECT CAST(a AS TEXT)",
    });
  });
});

// =============================================================================
// SQLite: ILIKE -> LIKE transpilation
// =============================================================================

describe("SQLite: ILIKE not supported (transpile to LIKE)", () => {
  it("ILIKE from default dialect transpiled to LIKE in SQLite", () => {
    const result = transpile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      readDialect: "",
      writeDialect: "sqlite",
    })[0];
    expect(result).toBe("SELECT a FROM t WHERE a LIKE '%test%'");
  });

  it("ILIKE from postgres transpiled to LIKE in SQLite", () => {
    const result = transpile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      readDialect: "postgres",
      writeDialect: "sqlite",
    })[0];
    expect(result).toBe("SELECT a FROM t WHERE a LIKE '%test%'");
  });

  it("ILIKE from duckdb transpiled to LIKE in SQLite", () => {
    const result = transpile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      readDialect: "duckdb",
      writeDialect: "sqlite",
    })[0];
    expect(result).toBe("SELECT a FROM t WHERE a LIKE '%test%'");
  });
});

// =============================================================================
// SQLite Aggregate Functions
// =============================================================================

describe("SQLite: aggregate functions", () => {
  it("COUNT(*)", () => {
    validateIdentity("SELECT COUNT(*) FROM test");
  });

  it("COUNT(column)", () => {
    validateIdentity("SELECT COUNT(a) FROM test");
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
// SQLite Window Functions
// =============================================================================

describe("SQLite: window functions", () => {
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
// SQLite: Subqueries
// =============================================================================

describe("SQLite: subqueries", () => {
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
// SQLite: String and numeric literals
// =============================================================================

describe("SQLite: string and numeric literals", () => {
  it("string literal", () => {
    validateIdentity("SELECT 'hello'");
  });

  it("escaped quote in string", () => {
    validateIdentity("SELECT 'it''s'");
  });

  it("empty string", () => {
    validateIdentity("SELECT ''");
  });

  it("numeric literal", () => {
    validateIdentity("SELECT 42");
  });

  it("float literal", () => {
    validateIdentity("SELECT 3.14");
  });

  it("negative number", () => {
    validateIdentity("SELECT -1");
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
// SQLite: Complex queries
// =============================================================================

describe("SQLite: complex queries", () => {
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

  it("CASE in SELECT with quoted columns", () => {
    validateIdentity(
      'SELECT CASE WHEN "status" = 1 THEN \'active\' ELSE \'inactive\' END AS "result" FROM "users"',
    );
  });
});

// =============================================================================
// SQLite: NOT variations
// =============================================================================

describe("SQLite: NOT variations", () => {
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
// SQLite: Comment handling
// =============================================================================

describe("SQLite: comment handling", () => {
  it("single line comment with --", () => {
    const result = transpile("SELECT 1 -- comment", {
      readDialect: "sqlite",
      writeDialect: "sqlite",
    })[0];
    expect(result).toBe("SELECT 1");
  });

  it("block comment /* */", () => {
    const result = transpile("SELECT /* comment */ 1", {
      readDialect: "sqlite",
      writeDialect: "sqlite",
    })[0];
    expect(result).toBe("SELECT 1");
  });
});

// =============================================================================
// SQLite: NULL and BOOLEAN handling
// =============================================================================

describe("SQLite: NULL and BOOLEAN", () => {
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
// SQLite: Cross-dialect type mapping transpilation
// =============================================================================

describe("SQLite: cross-dialect type transpilation", () => {
  it("CAST from default to SQLite maps INT -> INTEGER", () => {
    validateTranspile("SELECT CAST(x AS INT)", {
      read: "",
      write: "sqlite",
      expected: "SELECT CAST(x AS INTEGER)",
    });
  });

  it("CAST from default to SQLite maps DOUBLE -> REAL", () => {
    validateTranspile("SELECT CAST(x AS DOUBLE)", {
      read: "",
      write: "sqlite",
      expected: "SELECT CAST(x AS REAL)",
    });
  });

  it("CAST from default to SQLite maps VARCHAR -> TEXT", () => {
    validateTranspile("SELECT CAST(x AS VARCHAR)", {
      read: "",
      write: "sqlite",
      expected: "SELECT CAST(x AS TEXT)",
    });
  });

  it("CAST from default to SQLite maps BINARY -> BLOB", () => {
    validateTranspile("SELECT CAST(x AS BINARY)", {
      read: "",
      write: "sqlite",
      expected: "SELECT CAST(x AS BLOB)",
    });
  });
});

// =============================================================================
// SQLite: Features not yet implemented (marked as todo)
// =============================================================================

describe("SQLite: features not yet implemented", () => {
  it.todo("AUTOINCREMENT in CREATE TABLE");
  it.todo("CREATE TABLE / ALTER TABLE / DROP TABLE");
  it.todo("INSERT / UPDATE / DELETE");
  it.todo("CREATE VIEW / DROP VIEW");
  it.todo("CREATE INDEX / DROP INDEX");
  it.todo("PRAGMA statements");
  it.todo("REPLACE INTO");
  it.todo("INSERT OR IGNORE / INSERT OR REPLACE");
  it.todo("VACUUM");
  it.todo("ATTACH / DETACH DATABASE");
  it.todo("|| string concatenation operator");
  it.todo("GLOB operator");
  it.todo("typeof() function");
  it.todo("IFNULL / IIF functions");
  it.todo("GROUP_CONCAT");
  it.todo("RANDOM() -> RAND() transpilation");
  it.todo("Date functions (DATE, TIME, DATETIME, JULIANDAY, STRFTIME)");
  it.todo("WITHOUT ROWID tables");
  it.todo("LIMIT with OFFSET (parser limitation)");
  it.todo("Window functions with ROWS/RANGE frames");
  it.todo("RETURNING clause");
  it.todo("Generated columns (GENERATED ALWAYS AS)");
});
