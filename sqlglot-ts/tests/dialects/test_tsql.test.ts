import { describe, it, expect } from "vitest";
import { transpile, Dialect } from "../../src/index.js";
import "../../src/dialects/tsql.js";

/**
 * Validate that SQL round-trips through parse -> generate using the T-SQL dialect.
 */
function validateIdentity(sql: string, writeSql?: string): void {
  const result = transpile(sql, { readDialect: "tsql", writeDialect: "tsql" })[0];
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
    readDialect: opts.read ?? "tsql",
    writeDialect: opts.write ?? "tsql",
  })[0];
  expect(result).toBe(opts.expected);
}

// =============================================================================
// T-SQL dialect registration
// =============================================================================

describe("TSQL: dialect registration", () => {
  it("registers under 'tsql'", () => {
    const d = Dialect.getOrRaise("tsql");
    expect(d).toBeDefined();
    expect(d.constructor.name).toBe("TSQL");
  });

  it("uses square brackets for identifiers", () => {
    const d = Dialect.getOrRaise("tsql");
    expect(d.IDENTIFIER_START).toBe("[");
    expect(d.IDENTIFIER_END).toBe("]");
  });

  it("uses single quotes for strings", () => {
    const d = Dialect.getOrRaise("tsql");
    expect(d.QUOTE_START).toBe("'");
    expect(d.QUOTE_END).toBe("'");
  });
});

// =============================================================================
// T-SQL Identifier Quoting Tests
// =============================================================================

describe("TSQL: identifier quoting", () => {
  it("square-bracket identifiers round-trip", () => {
    validateIdentity("SELECT [a] FROM [b]");
  });

  it("square-bracket table.column round-trip", () => {
    validateIdentity("SELECT [a].[b] FROM [a]");
  });

  it("mixed quoted and unquoted identifiers", () => {
    validateIdentity("SELECT [a].b FROM a");
  });

  it("square-bracket alias", () => {
    validateIdentity("SELECT 1 AS [my alias]");
  });

  it("unquoted identifiers remain unquoted", () => {
    validateIdentity("SELECT a FROM b");
  });

  it("double-quote identifiers from T-SQL read become bracket-quoted", () => {
    // T-SQL tokenizer accepts double-quotes as identifier delimiters
    const result = transpile('SELECT "a" FROM "b"', {
      readDialect: "tsql",
      writeDialect: "tsql",
    })[0];
    expect(result).toBe("SELECT [a] FROM [b]");
  });

  it("identifiers with spaces use brackets", () => {
    validateIdentity("SELECT [my column] FROM [my table]");
  });

  it("brackets with special characters", () => {
    validateIdentity("SELECT [col name] FROM [schema].[table]");
  });
});

// =============================================================================
// T-SQL String Quoting Tests
// =============================================================================

describe("TSQL: string quoting", () => {
  it("single-quoted strings round-trip", () => {
    validateIdentity("SELECT 'hello'");
  });

  it("escaped single quote in string (quote doubling)", () => {
    validateIdentity("SELECT 'it''s'");
  });

  it("empty string", () => {
    validateIdentity("SELECT ''");
  });
});

// =============================================================================
// T-SQL to/from other dialects transpilation
// =============================================================================

describe("TSQL: transpile to default dialect", () => {
  it("bracket identifiers become double-quoted in default dialect", () => {
    validateTranspile("SELECT [a] FROM [b]", {
      read: "tsql",
      write: "",
      expected: 'SELECT "a" FROM "b"',
    });
  });

  it("unquoted identifiers pass through", () => {
    validateTranspile("SELECT a FROM b", {
      read: "tsql",
      write: "",
      expected: "SELECT a FROM b",
    });
  });
});

describe("TSQL: transpile from default dialect", () => {
  it("double-quoted identifiers become bracket-quoted", () => {
    validateTranspile('SELECT "a" FROM "b"', {
      read: "",
      write: "tsql",
      expected: "SELECT [a] FROM [b]",
    });
  });
});

describe("TSQL: transpile to/from Postgres", () => {
  it("Postgres double-quotes become brackets in T-SQL", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "postgres",
      write: "tsql",
      expected: "SELECT [col] FROM [tbl]",
    });
  });

  it("T-SQL brackets become double-quotes in Postgres", () => {
    validateTranspile("SELECT [col] FROM [tbl]", {
      read: "tsql",
      write: "postgres",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });
});

describe("TSQL: transpile to/from MySQL", () => {
  it("MySQL backticks become brackets in T-SQL", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "mysql",
      write: "tsql",
      expected: "SELECT [col] FROM [tbl]",
    });
  });

  it("T-SQL brackets become backticks in MySQL", () => {
    validateTranspile("SELECT [col] FROM [tbl]", {
      read: "tsql",
      write: "mysql",
      expected: "SELECT `col` FROM `tbl`",
    });
  });
});

describe("TSQL: transpile to/from SQLite", () => {
  it("SQLite double-quotes become brackets in T-SQL", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "sqlite",
      write: "tsql",
      expected: "SELECT [col] FROM [tbl]",
    });
  });

  it("T-SQL brackets become double-quotes in SQLite", () => {
    validateTranspile("SELECT [col] FROM [tbl]", {
      read: "tsql",
      write: "sqlite",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });
});

// =============================================================================
// T-SQL SELECT basics
// =============================================================================

describe("TSQL: SELECT basics", () => {
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
// T-SQL WHERE clause
// =============================================================================

describe("TSQL: WHERE clause", () => {
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
// T-SQL GROUP BY, HAVING, ORDER BY
// =============================================================================

describe("TSQL: GROUP BY, HAVING, ORDER BY", () => {
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

  it("GROUP BY + ORDER BY", () => {
    validateIdentity(
      "SELECT a, COUNT(*) FROM test GROUP BY a ORDER BY a",
    );
  });
});

// =============================================================================
// T-SQL JOINs
// =============================================================================

describe("TSQL: JOINs", () => {
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
// T-SQL Set Operations
// =============================================================================

describe("TSQL: set operations", () => {
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
// T-SQL CTEs
// =============================================================================

describe("TSQL: CTEs", () => {
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
// T-SQL CASE WHEN
// =============================================================================

describe("TSQL: CASE WHEN", () => {
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
// T-SQL CAST with type mappings
// =============================================================================

describe("TSQL: CAST type mappings", () => {
  it("BOOLEAN -> BIT", () => {
    validateTranspile("SELECT CAST(a AS BOOLEAN)", {
      write: "tsql",
      expected: "SELECT CAST(a AS BIT)",
    });
  });

  it("DOUBLE -> FLOAT", () => {
    validateTranspile("SELECT CAST(a AS DOUBLE)", {
      write: "tsql",
      expected: "SELECT CAST(a AS FLOAT)",
    });
  });

  it("TEXT -> VARCHAR(MAX)", () => {
    validateTranspile("SELECT CAST(a AS TEXT)", {
      write: "tsql",
      expected: "SELECT CAST(a AS VARCHAR(MAX))",
    });
  });

  it("TIMESTAMP -> DATETIME2", () => {
    validateTranspile("SELECT CAST(a AS TIMESTAMP)", {
      write: "tsql",
      expected: "SELECT CAST(a AS DATETIME2)",
    });
  });

  it("UUID -> UNIQUEIDENTIFIER", () => {
    validateTranspile("SELECT CAST(a AS UUID)", {
      write: "tsql",
      expected: "SELECT CAST(a AS UNIQUEIDENTIFIER)",
    });
  });

  it("BLOB -> IMAGE", () => {
    validateTranspile("SELECT CAST(a AS BLOB)", {
      read: "sqlite",
      write: "tsql",
      expected: "SELECT CAST(a AS IMAGE)",
    });
  });

  it("INT stays INT", () => {
    validateTranspile("SELECT CAST(a AS INT)", {
      write: "tsql",
      expected: "SELECT CAST(a AS INT)",
    });
  });

  it("VARCHAR stays VARCHAR", () => {
    validateTranspile("SELECT CAST(a AS VARCHAR)", {
      write: "tsql",
      expected: "SELECT CAST(a AS VARCHAR)",
    });
  });

  it("VARCHAR with size stays VARCHAR(n)", () => {
    validateTranspile("SELECT CAST(a AS VARCHAR(100))", {
      write: "tsql",
      expected: "SELECT CAST(a AS VARCHAR(100))",
    });
  });

  it("NVARCHAR stays NVARCHAR", () => {
    validateTranspile("SELECT CAST(a AS NVARCHAR)", {
      write: "tsql",
      expected: "SELECT CAST(a AS NVARCHAR)",
    });
  });

  it("CHAR stays CHAR", () => {
    validateTranspile("SELECT CAST(a AS CHAR)", {
      write: "tsql",
      expected: "SELECT CAST(a AS CHAR)",
    });
  });

  it("NCHAR stays NCHAR", () => {
    validateTranspile("SELECT CAST(a AS NCHAR)", {
      write: "tsql",
      expected: "SELECT CAST(a AS NCHAR)",
    });
  });

  it("DECIMAL stays DECIMAL", () => {
    validateTranspile("SELECT CAST(a AS DECIMAL)", {
      write: "tsql",
      expected: "SELECT CAST(a AS DECIMAL)",
    });
  });

  it("FLOAT stays FLOAT", () => {
    validateTranspile("SELECT CAST(a AS FLOAT)", {
      write: "tsql",
      expected: "SELECT CAST(a AS FLOAT)",
    });
  });

  it("BIGINT stays BIGINT", () => {
    validateTranspile("SELECT CAST(a AS BIGINT)", {
      write: "tsql",
      expected: "SELECT CAST(a AS BIGINT)",
    });
  });
});

// =============================================================================
// T-SQL: ILIKE not supported (transpile to LIKE)
// =============================================================================

describe("TSQL: ILIKE not supported (transpile to LIKE)", () => {
  it("ILIKE from default dialect transpiled to LIKE in T-SQL", () => {
    const result = transpile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      readDialect: "",
      writeDialect: "tsql",
    })[0];
    expect(result).toBe("SELECT a FROM t WHERE a LIKE '%test%'");
  });

  it("ILIKE from postgres transpiled to LIKE in T-SQL", () => {
    const result = transpile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      readDialect: "postgres",
      writeDialect: "tsql",
    })[0];
    expect(result).toBe("SELECT a FROM t WHERE a LIKE '%test%'");
  });

  it("ILIKE from duckdb transpiled to LIKE in T-SQL", () => {
    const result = transpile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      readDialect: "duckdb",
      writeDialect: "tsql",
    })[0];
    expect(result).toBe("SELECT a FROM t WHERE a LIKE '%test%'");
  });
});

// =============================================================================
// T-SQL Aggregate Functions
// =============================================================================

describe("TSQL: aggregate functions", () => {
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
// T-SQL Window Functions
// =============================================================================

describe("TSQL: window functions", () => {
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
// T-SQL: Subqueries
// =============================================================================

describe("TSQL: subqueries", () => {
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
// T-SQL: String and numeric literals
// =============================================================================

describe("TSQL: string and numeric literals", () => {
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
});

// =============================================================================
// T-SQL: NOT variations
// =============================================================================

describe("TSQL: NOT variations", () => {
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
// T-SQL: Comment handling
// =============================================================================

describe("TSQL: comment handling", () => {
  it("single line comment with --", () => {
    const result = transpile("SELECT 1 -- comment", {
      readDialect: "tsql",
      writeDialect: "tsql",
    })[0];
    expect(result).toBe("SELECT 1");
  });

  it("block comment /* */", () => {
    const result = transpile("SELECT /* comment */ 1", {
      readDialect: "tsql",
      writeDialect: "tsql",
    })[0];
    expect(result).toBe("SELECT 1");
  });
});

// =============================================================================
// T-SQL: NULL and BOOLEAN handling
// =============================================================================

describe("TSQL: NULL and BOOLEAN", () => {
  it("NULL literal", () => {
    validateIdentity("SELECT NULL");
  });

  it("TRUE becomes 1 in T-SQL", () => {
    validateTranspile("SELECT TRUE", {
      read: "",
      write: "tsql",
      expected: "SELECT 1",
    });
  });

  it("FALSE becomes 0 in T-SQL", () => {
    validateTranspile("SELECT FALSE", {
      read: "",
      write: "tsql",
      expected: "SELECT 0",
    });
  });

  it("IS NULL", () => {
    validateIdentity("SELECT a IS NULL FROM test");
  });
});

// =============================================================================
// T-SQL: Cross-dialect type mapping transpilation
// =============================================================================

describe("TSQL: cross-dialect type transpilation", () => {
  it("CAST from default to T-SQL maps BOOLEAN -> BIT", () => {
    validateTranspile("SELECT CAST(x AS BOOLEAN)", {
      read: "",
      write: "tsql",
      expected: "SELECT CAST(x AS BIT)",
    });
  });

  it("CAST from default to T-SQL maps DOUBLE -> FLOAT", () => {
    validateTranspile("SELECT CAST(x AS DOUBLE)", {
      read: "",
      write: "tsql",
      expected: "SELECT CAST(x AS FLOAT)",
    });
  });

  it("CAST from default to T-SQL maps TEXT -> VARCHAR(MAX)", () => {
    validateTranspile("SELECT CAST(x AS TEXT)", {
      read: "",
      write: "tsql",
      expected: "SELECT CAST(x AS VARCHAR(MAX))",
    });
  });

  it("CAST from default to T-SQL maps TIMESTAMP -> DATETIME2", () => {
    validateTranspile("SELECT CAST(x AS TIMESTAMP)", {
      read: "",
      write: "tsql",
      expected: "SELECT CAST(x AS DATETIME2)",
    });
  });

  it("CAST from Postgres to T-SQL maps BOOLEAN -> BIT", () => {
    validateTranspile("SELECT CAST(x AS BOOLEAN)", {
      read: "postgres",
      write: "tsql",
      expected: "SELECT CAST(x AS BIT)",
    });
  });

  it("BIT stays BIT when writing to Postgres (no cross-type normalization yet)", () => {
    // Full cross-dialect type normalization (BIT -> BOOLEAN) requires the parser to
    // store normalized TokenType-based type names, which is not yet implemented.
    validateTranspile("SELECT CAST(x AS BIT)", {
      read: "tsql",
      write: "postgres",
      expected: "SELECT CAST(x AS BIT)",
    });
  });

  it("NTEXT stays NTEXT (tokenizer keyword mapping does not change stored text)", () => {
    // The parser stores raw token text for data types; the keyword mapping
    // NTEXT -> TEXT only affects token classification, not the stored type name.
    validateTranspile("SELECT CAST(x AS NTEXT)", {
      read: "tsql",
      write: "tsql",
      expected: "SELECT CAST(x AS NTEXT)",
    });
  });

  it("T-SQL UNIQUEIDENTIFIER round-trips to UUID and back", () => {
    validateTranspile("SELECT CAST(x AS UNIQUEIDENTIFIER)", {
      read: "tsql",
      write: "tsql",
      expected: "SELECT CAST(x AS UNIQUEIDENTIFIER)",
    });
  });

  it("T-SQL IMAGE is parsed correctly", () => {
    validateTranspile("SELECT CAST(x AS IMAGE)", {
      read: "tsql",
      write: "tsql",
      expected: "SELECT CAST(x AS IMAGE)",
    });
  });

  it("BIT stays BIT when writing to SQLite (no cross-type normalization yet)", () => {
    // Full cross-dialect type normalization (BIT -> INTEGER) requires the parser to
    // store normalized TokenType-based type names, which is not yet implemented.
    validateTranspile("SELECT CAST(x AS BIT)", {
      read: "tsql",
      write: "sqlite",
      expected: "SELECT CAST(x AS BIT)",
    });
  });
});

// =============================================================================
// T-SQL: Complex queries
// =============================================================================

describe("TSQL: complex queries", () => {
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

  it("CASE in SELECT with bracket-quoted columns", () => {
    validateIdentity(
      "SELECT CASE WHEN [status] = 1 THEN 'active' ELSE 'inactive' END AS [result] FROM [users]",
    );
  });
});

// =============================================================================
// T-SQL: Features not yet implemented (marked as todo)
// =============================================================================

describe("TSQL: features not yet implemented", () => {
  it.todo("COUNT DISTINCT");
  it.todo("EXISTS subquery");
  it.todo("LIMIT/OFFSET (T-SQL uses TOP or OFFSET FETCH)");
  it.todo("TOP clause");
  it.todo("OFFSET FETCH clause");
  it.todo("MERGE statement");
  it.todo("OUTPUT clause");
  it.todo("CROSS APPLY / OUTER APPLY");
  it.todo("PIVOT / UNPIVOT");
  it.todo("T-SQL specific functions (GETDATE, DATEADD, DATEDIFF, etc.)");
  it.todo("@@IDENTITY, SCOPE_IDENTITY(), @@ROWCOUNT system variables");
  it.todo("DECLARE / SET variable statements");
  it.todo("BEGIN...END blocks");
  it.todo("IF...ELSE control flow");
  it.todo("WHILE loops");
  it.todo("TRY...CATCH error handling");
  it.todo("Stored procedures (CREATE PROCEDURE / EXEC)");
  it.todo("Triggers (CREATE TRIGGER)");
  it.todo("Table-valued parameters");
  it.todo("Temporary tables (#temp, ##global_temp)");
  it.todo("Table variables (@table)");
  it.todo("INSERT / UPDATE / DELETE");
  it.todo("CREATE TABLE / ALTER TABLE / DROP TABLE");
  it.todo("CREATE VIEW / DROP VIEW");
  it.todo("CREATE INDEX");
  it.todo("WITH (NOLOCK) table hints");
  it.todo("STRING_AGG function");
  it.todo("ISNULL -> COALESCE transpilation");
  it.todo("T-SQL CONVERT function");
  it.todo("IIF function");
  it.todo("Window functions with ROWS/RANGE frames");
  it.todo("ORDER BY NULLS FIRST/LAST (not supported in T-SQL)");
  it.todo("RETURNING / OUTPUT clause transpilation");
});
