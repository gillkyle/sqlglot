import { describe, it, expect } from "vitest";
import { transpile, Dialect } from "../../src/index.js";

/**
 * Validate that SQL round-trips through parse -> generate using the BigQuery dialect.
 * If writeSql is provided, the generated output is expected to match writeSql.
 * Otherwise, the output should match the input sql exactly.
 */
function validateIdentity(sql: string, writeSql?: string): void {
  const result = transpile(sql, { readDialect: "bigquery", writeDialect: "bigquery" })[0];
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
    readDialect: opts.read ?? "bigquery",
    writeDialect: opts.write ?? "bigquery",
  })[0];
  expect(result).toBe(opts.expected);
}

// =============================================================================
// BigQuery dialect registration
// =============================================================================

describe("BigQuery: dialect registration", () => {
  it("registers under 'bigquery'", () => {
    const d = Dialect.getOrRaise("bigquery");
    expect(d).toBeDefined();
    expect(d.constructor.name).toBe("BigQuery");
  });

  it("uses backtick for identifiers", () => {
    const d = Dialect.getOrRaise("bigquery");
    expect(d.IDENTIFIER_START).toBe("`");
    expect(d.IDENTIFIER_END).toBe("`");
  });

  it("has case-sensitive function names (NORMALIZE_FUNCTIONS = false)", () => {
    const d = Dialect.getOrRaise("bigquery");
    expect(d.NORMALIZE_FUNCTIONS).toBe(false);
  });
});

// =============================================================================
// BigQuery Identifier Quoting Tests
// =============================================================================

describe("BigQuery: identifier quoting with backticks", () => {
  it("backtick-quoted identifiers round-trip", () => {
    validateIdentity("SELECT `a` FROM `b`");
  });

  it("backtick-quoted table.column round-trip", () => {
    validateIdentity("SELECT `a`.`b` FROM `a`");
  });

  it("mixed quoted and unquoted identifiers", () => {
    validateIdentity("SELECT `a`.b FROM a");
  });

  it("backtick-quoted alias", () => {
    validateIdentity("SELECT 1 AS `my alias`");
  });

  it("backtick three-part name", () => {
    validateIdentity("SELECT `a`.`b`.`c`");
  });

  it("unquoted identifiers remain unquoted", () => {
    validateIdentity("SELECT a FROM b");
  });
});

// =============================================================================
// BigQuery to default dialect transpilation (backtick -> double-quote)
// =============================================================================

describe("BigQuery: transpile BigQuery quoted identifiers to default dialect", () => {
  it("backtick identifiers become double-quoted in default dialect", () => {
    validateTranspile("SELECT `a` FROM `b`", {
      read: "bigquery",
      write: "",
      expected: 'SELECT "a" FROM "b"',
    });
  });

  it("backtick table.column becomes double-quoted", () => {
    validateTranspile("SELECT `t`.`c` FROM `t`", {
      read: "bigquery",
      write: "",
      expected: 'SELECT "t"."c" FROM "t"',
    });
  });

  it("unquoted identifiers pass through to default dialect", () => {
    validateTranspile("SELECT a FROM b", {
      read: "bigquery",
      write: "",
      expected: "SELECT a FROM b",
    });
  });
});

// =============================================================================
// Default dialect to BigQuery transpilation (double-quote -> backtick)
// =============================================================================

describe("BigQuery: transpile default dialect to BigQuery", () => {
  it("double-quoted identifiers become backtick-quoted in BigQuery", () => {
    validateTranspile('SELECT "a" FROM "b"', {
      read: "",
      write: "bigquery",
      expected: "SELECT `a` FROM `b`",
    });
  });

  it("double-quoted table.column becomes backtick-quoted", () => {
    validateTranspile('SELECT "t"."c" FROM "t"', {
      read: "",
      write: "bigquery",
      expected: "SELECT `t`.`c` FROM `t`",
    });
  });
});

// =============================================================================
// BigQuery SELECT basics
// =============================================================================

describe("BigQuery: SELECT basics", () => {
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
// BigQuery WHERE clause
// =============================================================================

describe("BigQuery: WHERE clause", () => {
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

  it("WHERE with subquery IN", () => {
    validateIdentity("SELECT a FROM test WHERE a IN (SELECT b FROM other)");
  });
});

// =============================================================================
// BigQuery GROUP BY, HAVING, ORDER BY
// =============================================================================

describe("BigQuery: GROUP BY, HAVING, ORDER BY", () => {
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
// BigQuery JOINs
// =============================================================================

describe("BigQuery: JOINs", () => {
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
// BigQuery Set Operations
// =============================================================================

describe("BigQuery: set operations", () => {
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
// BigQuery CTEs
// =============================================================================

describe("BigQuery: CTEs", () => {
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
// BigQuery CASE WHEN
// =============================================================================

describe("BigQuery: CASE WHEN", () => {
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
// BigQuery CAST with type mappings
// =============================================================================

describe("BigQuery: CAST", () => {
  it("CAST as INT -> INT64", () => {
    validateTranspile("SELECT CAST(a AS INT)", {
      write: "bigquery",
      expected: "SELECT CAST(a AS INT64)",
    });
  });

  it("CAST as BIGINT -> INT64", () => {
    validateTranspile("SELECT CAST(a AS BIGINT)", {
      write: "bigquery",
      expected: "SELECT CAST(a AS INT64)",
    });
  });

  it("CAST as SMALLINT -> INT64", () => {
    validateTranspile("SELECT CAST(a AS SMALLINT)", {
      write: "bigquery",
      expected: "SELECT CAST(a AS INT64)",
    });
  });

  it("CAST as TINYINT -> INT64", () => {
    validateTranspile("SELECT CAST(a AS TINYINT)", {
      write: "bigquery",
      expected: "SELECT CAST(a AS INT64)",
    });
  });

  it("CAST as FLOAT -> FLOAT64", () => {
    validateTranspile("SELECT CAST(a AS FLOAT)", {
      write: "bigquery",
      expected: "SELECT CAST(a AS FLOAT64)",
    });
  });

  it("CAST as DOUBLE -> FLOAT64", () => {
    validateTranspile("SELECT CAST(a AS DOUBLE)", {
      write: "bigquery",
      expected: "SELECT CAST(a AS FLOAT64)",
    });
  });

  it("CAST as BOOLEAN -> BOOL", () => {
    validateTranspile("SELECT CAST(a AS BOOLEAN)", {
      write: "bigquery",
      expected: "SELECT CAST(a AS BOOL)",
    });
  });

  it("CAST as VARCHAR -> STRING", () => {
    validateTranspile("SELECT CAST(a AS VARCHAR)", {
      write: "bigquery",
      expected: "SELECT CAST(a AS STRING)",
    });
  });

  it("CAST as TEXT -> STRING", () => {
    validateTranspile("SELECT CAST(a AS TEXT)", {
      write: "bigquery",
      expected: "SELECT CAST(a AS STRING)",
    });
  });

  it("CAST as CHAR -> STRING", () => {
    validateTranspile("SELECT CAST(a AS CHAR)", {
      write: "bigquery",
      expected: "SELECT CAST(a AS STRING)",
    });
  });

  it("CAST as BINARY -> BYTES", () => {
    validateTranspile("SELECT CAST(a AS BINARY)", {
      write: "bigquery",
      expected: "SELECT CAST(a AS BYTES)",
    });
  });

  it("CAST as VARBINARY -> BYTES", () => {
    validateTranspile("SELECT CAST(a AS VARBINARY)", {
      write: "bigquery",
      expected: "SELECT CAST(a AS BYTES)",
    });
  });

  it("CAST as BLOB -> BYTES", () => {
    validateTranspile("SELECT CAST(a AS BLOB)", {
      write: "bigquery",
      expected: "SELECT CAST(a AS BYTES)",
    });
  });

  it("CAST as DECIMAL -> NUMERIC", () => {
    validateTranspile("SELECT CAST(a AS DECIMAL)", {
      write: "bigquery",
      expected: "SELECT CAST(a AS NUMERIC)",
    });
  });

  it("CAST as TIMESTAMP -> DATETIME", () => {
    validateTranspile("SELECT CAST(a AS TIMESTAMP)", {
      write: "bigquery",
      expected: "SELECT CAST(a AS DATETIME)",
    });
  });

  it("DATE stays DATE", () => {
    validateTranspile("SELECT CAST(a AS DATE)", {
      write: "bigquery",
      expected: "SELECT CAST(a AS DATE)",
    });
  });
});

// =============================================================================
// BigQuery: Function case sensitivity
// =============================================================================

describe("BigQuery: function case sensitivity", () => {
  it("uppercase function names round-trip", () => {
    validateIdentity("SELECT COUNT(*) FROM test");
  });

  it.todo("preserves lowercase function names (requires parser-level case preservation)");
  it.todo("preserves mixed case function names (requires parser-level case preservation)");
});

// =============================================================================
// BigQuery Aggregate Functions
// =============================================================================

describe("BigQuery: aggregate functions", () => {
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
// BigQuery Window Functions
// =============================================================================

describe("BigQuery: window functions", () => {
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
// BigQuery: ILIKE -> LIKE transpilation
// =============================================================================

describe("BigQuery: ILIKE not supported (transpile to LIKE)", () => {
  it("ILIKE from default dialect transpiled to LIKE in BigQuery", () => {
    const result = transpile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      readDialect: "",
      writeDialect: "bigquery",
    })[0];
    expect(result).toBe("SELECT a FROM t WHERE a LIKE '%test%'");
  });

  it("ILIKE from postgres transpiled to LIKE in BigQuery", () => {
    const result = transpile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      readDialect: "postgres",
      writeDialect: "bigquery",
    })[0];
    expect(result).toBe("SELECT a FROM t WHERE a LIKE '%test%'");
  });
});

// =============================================================================
// BigQuery: Subqueries
// =============================================================================

describe("BigQuery: subqueries", () => {
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
// BigQuery: String and numeric literals
// =============================================================================

describe("BigQuery: string and numeric literals", () => {
  it("string literal", () => {
    validateIdentity("SELECT 'hello'");
  });

  it("escaped quote in string", () => {
    validateIdentity("SELECT ''''");
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
// BigQuery: Complex queries
// =============================================================================

describe("BigQuery: complex queries", () => {
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
// BigQuery: Cross-dialect transpilation
// =============================================================================

describe("BigQuery: cross-dialect transpilation", () => {
  it("simple SELECT from BigQuery to default", () => {
    validateTranspile("SELECT a FROM test", {
      read: "bigquery",
      write: "",
      expected: "SELECT a FROM test",
    });
  });

  it("simple SELECT from default to BigQuery", () => {
    validateTranspile("SELECT a FROM test", {
      read: "",
      write: "bigquery",
      expected: "SELECT a FROM test",
    });
  });

  it("SELECT with backtick identifiers from BigQuery to default", () => {
    validateTranspile("SELECT `column_name` FROM `table_name`", {
      read: "bigquery",
      write: "",
      expected: 'SELECT "column_name" FROM "table_name"',
    });
  });

  it("SELECT with double-quote identifiers from default to BigQuery", () => {
    validateTranspile('SELECT "column_name" FROM "table_name"', {
      read: "",
      write: "bigquery",
      expected: "SELECT `column_name` FROM `table_name`",
    });
  });

  it("BigQuery to Postgres", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "bigquery",
      write: "postgres",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("BigQuery to MySQL", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "bigquery",
      write: "mysql",
      expected: "SELECT `col` FROM `tbl`",
    });
  });

  it("Postgres to BigQuery", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "postgres",
      write: "bigquery",
      expected: "SELECT `col` FROM `tbl`",
    });
  });

  it("MySQL to BigQuery", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "mysql",
      write: "bigquery",
      expected: "SELECT `col` FROM `tbl`",
    });
  });

  it("CAST type mapping from default to BigQuery", () => {
    validateTranspile("SELECT CAST(x AS INT)", {
      read: "",
      write: "bigquery",
      expected: "SELECT CAST(x AS INT64)",
    });
  });

  it("CAST type mapping from BigQuery to Postgres", () => {
    validateTranspile("SELECT CAST(x AS FLOAT)", {
      read: "",
      write: "bigquery",
      expected: "SELECT CAST(x AS FLOAT64)",
    });
  });
});

// =============================================================================
// BigQuery: double-quoted strings
// =============================================================================

describe("BigQuery: double-quoted strings", () => {
  it("double-quoted strings are parsed as string literals in BigQuery tokenizer", () => {
    // BigQuery tokenizer treats double-quoted strings as string literals
    const result = transpile('SELECT "hello"', {
      readDialect: "bigquery",
      writeDialect: "bigquery",
    })[0];
    expect(result).toBe("SELECT 'hello'");
  });
});

// =============================================================================
// BigQuery: Comment handling
// =============================================================================

describe("BigQuery: comment handling", () => {
  it("single line comment with --", () => {
    const result = transpile("SELECT 1 -- comment", {
      readDialect: "bigquery",
      writeDialect: "bigquery",
    })[0];
    expect(result).toBe("SELECT 1");
  });

  it("block comment /* */", () => {
    const result = transpile("SELECT /* comment */ 1", {
      readDialect: "bigquery",
      writeDialect: "bigquery",
    })[0];
    expect(result).toBe("SELECT 1");
  });
});

// =============================================================================
// BigQuery: NOT variations
// =============================================================================

describe("BigQuery: NOT variations", () => {
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
// BigQuery: Features not yet implemented (marked as todo)
// =============================================================================

describe("BigQuery: features not yet implemented", () => {
  it.todo("SAFE_CAST");
  it.todo("CREATE TABLE with PARTITION BY");
  it.todo("CREATE TABLE with CLUSTER BY");
  it.todo("STRUCT types");
  it.todo("ARRAY types and ARRAY_AGG");
  it.todo("UNNEST");
  it.todo("TABLESAMPLE");
  it.todo("MERGE statement");
  it.todo("INSERT / UPDATE / DELETE");
  it.todo("CREATE OR REPLACE TABLE / VIEW");
  it.todo("IF function (BigQuery-specific)");
  it.todo("FORMAT_DATE / PARSE_DATE");
  it.todo("TIMESTAMP_DIFF / DATE_DIFF");
  it.todo("GENERATE_ARRAY / GENERATE_DATE_ARRAY");
  it.todo("STRING_AGG");
  it.todo("APPROX_COUNT_DISTINCT");
  it.todo("BigQuery-specific regex functions (REGEXP_CONTAINS, REGEXP_EXTRACT)");
  it.todo("QUALIFY clause");
  it.todo("PIVOT / UNPIVOT");
  it.todo("BigQuery ML (CREATE MODEL)");
  it.todo("WINDOW clause (named windows)");
  it.todo("WITH OFFSET in UNNEST");
  it.todo("BigQuery parameterized types like STRING(100)");
});
