import { describe, it, expect } from "vitest";
import { transpile, Dialect } from "../../src/index.js";

/**
 * Validate that SQL round-trips through parse -> generate using the Snowflake dialect.
 * If writeSql is provided, the generated output is expected to match writeSql.
 * Otherwise, the output should match the input sql exactly.
 */
function validateIdentity(sql: string, writeSql?: string): void {
  const result = transpile(sql, { readDialect: "snowflake", writeDialect: "snowflake" })[0];
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
    readDialect: opts.read ?? "snowflake",
    writeDialect: opts.write ?? "snowflake",
  })[0];
  expect(result).toBe(opts.expected);
}

// =============================================================================
// Snowflake dialect registration
// =============================================================================

describe("Snowflake: dialect registration", () => {
  it("registers under 'snowflake'", () => {
    const d = Dialect.getOrRaise("snowflake");
    expect(d).toBeDefined();
    expect(d.constructor.name).toBe("Snowflake");
  });

  it("uses double-quote for identifiers", () => {
    const d = Dialect.getOrRaise("snowflake");
    expect(d.IDENTIFIER_START).toBe('"');
    expect(d.IDENTIFIER_END).toBe('"');
  });

  it("normalizes functions to uppercase", () => {
    const d = Dialect.getOrRaise("snowflake");
    expect(d.NORMALIZE_FUNCTIONS).toBe("upper");
  });
});

// =============================================================================
// Snowflake: Identity round-trips
// =============================================================================

describe("Snowflake: identity round-trips", () => {
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

  it("double-quoted identifiers round-trip", () => {
    validateIdentity('SELECT "a" FROM "b"');
  });

  it("double-quoted table.column round-trip", () => {
    validateIdentity('SELECT "a"."b" FROM "a"');
  });

  it("mixed quoted and unquoted identifiers", () => {
    validateIdentity('SELECT "a".b FROM a');
  });
});

// =============================================================================
// Snowflake: WHERE clause
// =============================================================================

describe("Snowflake: WHERE clause", () => {
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

  it("WHERE with ILIKE", () => {
    validateIdentity("SELECT a FROM test WHERE a ILIKE '%test%'");
  });

  it("WHERE with IS NULL", () => {
    validateIdentity("SELECT a FROM test WHERE a IS NULL");
  });
});

// =============================================================================
// Snowflake: GROUP BY, HAVING, ORDER BY
// =============================================================================

describe("Snowflake: GROUP BY, HAVING, ORDER BY", () => {
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

  it("ORDER BY NULLS FIRST", () => {
    validateIdentity("SELECT a FROM test ORDER BY a NULLS FIRST");
  });

  it("ORDER BY NULLS LAST", () => {
    validateIdentity("SELECT a FROM test ORDER BY a NULLS LAST");
  });
});

// =============================================================================
// Snowflake: JOINs
// =============================================================================

describe("Snowflake: JOINs", () => {
  it("JOIN ... ON", () => {
    validateIdentity("SELECT 1 FROM a JOIN b ON a.x = b.x");
  });

  it("INNER JOIN", () => {
    validateIdentity("SELECT 1 FROM a INNER JOIN b ON a.x = b.x");
  });

  it("LEFT JOIN", () => {
    validateIdentity("SELECT 1 FROM a LEFT JOIN b ON a.x = b.x");
  });

  it("CROSS JOIN", () => {
    validateIdentity("SELECT 1 FROM a CROSS JOIN b ON a.x = b.x");
  });

  it("JOIN ... USING", () => {
    validateIdentity("SELECT 1 FROM a JOIN b USING (x)");
  });
});

// =============================================================================
// Snowflake: Set operations
// =============================================================================

describe("Snowflake: set operations", () => {
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
// Snowflake: CTEs
// =============================================================================

describe("Snowflake: CTEs", () => {
  it("simple CTE", () => {
    validateIdentity("WITH cte AS (SELECT 1) SELECT * FROM cte");
  });

  it("multiple CTEs", () => {
    validateIdentity(
      "WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a",
    );
  });
});

// =============================================================================
// Snowflake: CASE WHEN
// =============================================================================

describe("Snowflake: CASE WHEN", () => {
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
// Snowflake: Comment handling (// line comments)
// =============================================================================

describe("Snowflake: comment handling", () => {
  it("// line comment is stripped on round-trip", () => {
    const result = transpile("SELECT 1 // this is a comment", {
      readDialect: "snowflake",
      writeDialect: "snowflake",
    })[0];
    expect(result).toBe("SELECT 1");
  });

  it("-- line comment is stripped on round-trip", () => {
    const result = transpile("SELECT 1 -- comment", {
      readDialect: "snowflake",
      writeDialect: "snowflake",
    })[0];
    expect(result).toBe("SELECT 1");
  });

  it("block comment /* */ is stripped on round-trip", () => {
    const result = transpile("SELECT /* comment */ 1", {
      readDialect: "snowflake",
      writeDialect: "snowflake",
    })[0];
    expect(result).toBe("SELECT 1");
  });

  it("// comment before FROM", () => {
    const result = transpile("SELECT a // get column a\nFROM test", {
      readDialect: "snowflake",
      writeDialect: "snowflake",
    })[0];
    expect(result).toBe("SELECT a FROM test");
  });
});

// =============================================================================
// Snowflake: Type mapping transpilation (Generator TYPE_MAP)
// =============================================================================

describe("Snowflake: type mappings in CAST", () => {
  it("CAST as STRUCT -> OBJECT", () => {
    validateTranspile("SELECT CAST(a AS STRUCT)", {
      read: "",
      write: "snowflake",
      expected: "SELECT CAST(a AS OBJECT)",
    });
  });

  it("CAST as TEXT -> VARCHAR", () => {
    validateTranspile("SELECT CAST(a AS TEXT)", {
      read: "",
      write: "snowflake",
      expected: "SELECT CAST(a AS VARCHAR)",
    });
  });

  it("CAST as BIGDECIMAL -> DOUBLE", () => {
    validateTranspile("SELECT CAST(a AS BIGDECIMAL)", {
      read: "",
      write: "snowflake",
      expected: "SELECT CAST(a AS DOUBLE)",
    });
  });

  it("CAST as INT stays INT", () => {
    validateIdentity("SELECT CAST(a AS INT)");
  });

  it("CAST as VARCHAR stays VARCHAR", () => {
    validateIdentity("SELECT CAST(a AS VARCHAR)");
  });

  it("CAST as DATE stays DATE", () => {
    validateIdentity("SELECT CAST(a AS DATE)");
  });

  it("CAST as DOUBLE stays DOUBLE", () => {
    validateIdentity("SELECT CAST(a AS DOUBLE)");
  });
});

// =============================================================================
// Snowflake: FLOAT -> DOUBLE keyword mapping (tokenizer level)
// =============================================================================

describe("Snowflake: FLOAT -> DOUBLE tokenizer mapping", () => {
  it("CAST(x AS FLOAT) stays FLOAT (type names parsed directly)", () => {
    validateIdentity("SELECT CAST(x AS FLOAT)");
  });

  it.todo("FLOAT keyword mapping in non-CAST contexts");
  it.todo("BYTEINT keyword mapping in non-CAST contexts");
});

// =============================================================================
// Snowflake: Aggregate and window functions
// =============================================================================

describe("Snowflake: aggregate and window functions", () => {
  it("COUNT(*)", () => {
    validateIdentity("SELECT COUNT(*) FROM test");
  });

  it("SUM", () => {
    validateIdentity("SELECT SUM(a) FROM test");
  });

  it("AVG", () => {
    validateIdentity("SELECT AVG(a) FROM test");
  });

  it("COALESCE", () => {
    validateIdentity("SELECT COALESCE(a, b, c) FROM test");
  });

  it("ROW_NUMBER", () => {
    validateIdentity("SELECT ROW_NUMBER() OVER (ORDER BY a) FROM test");
  });

  it("RANK with PARTITION BY", () => {
    validateIdentity(
      "SELECT RANK() OVER (PARTITION BY a ORDER BY b) FROM test",
    );
  });
});

// =============================================================================
// Snowflake: Cross-dialect transpilation
// =============================================================================

describe("Snowflake: cross-dialect transpilation", () => {
  it("Snowflake to default dialect", () => {
    validateTranspile("SELECT a FROM test", {
      read: "snowflake",
      write: "",
      expected: "SELECT a FROM test",
    });
  });

  it("default dialect to Snowflake", () => {
    validateTranspile("SELECT a FROM test", {
      read: "",
      write: "snowflake",
      expected: "SELECT a FROM test",
    });
  });

  it("Snowflake quoted identifiers to default", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "snowflake",
      write: "",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("Snowflake to Postgres (both use double-quote)", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "snowflake",
      write: "postgres",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("Snowflake to BigQuery (double-quote -> backtick)", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "snowflake",
      write: "bigquery",
      expected: "SELECT `col` FROM `tbl`",
    });
  });

  it("BigQuery to Snowflake (backtick -> double-quote)", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "bigquery",
      write: "snowflake",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("Snowflake to MySQL (double-quote -> backtick)", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "snowflake",
      write: "mysql",
      expected: "SELECT `col` FROM `tbl`",
    });
  });

  it("MySQL to Snowflake (backtick -> double-quote)", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "mysql",
      write: "snowflake",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("Snowflake to DuckDB: TEXT -> TEXT (DuckDB maps VARCHAR -> TEXT)", () => {
    validateTranspile("SELECT CAST(a AS TEXT)", {
      read: "",
      write: "duckdb",
      expected: "SELECT CAST(a AS TEXT)",
    });
  });

  it("Snowflake to DuckDB: STRUCT -> STRUCT in DuckDB (no DuckDB override for STRUCT)", () => {
    validateTranspile("SELECT CAST(a AS STRUCT)", {
      read: "",
      write: "duckdb",
      expected: "SELECT CAST(a AS STRUCT)",
    });
  });

  it("Snowflake CAST FLOAT -> Postgres REAL", () => {
    // Postgres generator maps FLOAT -> REAL
    validateTranspile("SELECT CAST(x AS FLOAT)", {
      read: "snowflake",
      write: "postgres",
      expected: "SELECT CAST(x AS REAL)",
    });
  });

  it("Snowflake CAST FLOAT -> BigQuery FLOAT64", () => {
    // BigQuery generator maps FLOAT -> FLOAT64
    validateTranspile("SELECT CAST(x AS FLOAT)", {
      read: "snowflake",
      write: "bigquery",
      expected: "SELECT CAST(x AS FLOAT64)",
    });
  });

  it("Snowflake to SingleStore", () => {
    validateTranspile("SELECT a FROM test WHERE a = 1", {
      read: "snowflake",
      write: "singlestore",
      expected: "SELECT a FROM test WHERE a = 1",
    });
  });
});

// =============================================================================
// Snowflake: Complex queries
// =============================================================================

describe("Snowflake: complex queries", () => {
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
// Snowflake: String and numeric literals
// =============================================================================

describe("Snowflake: string and numeric literals", () => {
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
// Snowflake: NOT variations
// =============================================================================

describe("Snowflake: NOT variations", () => {
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
// Snowflake: Features not yet implemented (marked as todo)
// =============================================================================

describe("Snowflake: features not yet implemented", () => {
  it.todo("EXTRACT -> DATE_PART transformation");
  it.todo("IFF conditional function");
  it.todo("TRY_CAST with string-only input requirement");
  it.todo("Colon (:) variant/JSON access syntax");
  it.todo("FLATTEN / UNNEST transformation");
  it.todo("MINUS -> EXCEPT transformation (tokenizer maps, but parser/generator not tested)");
  it.todo("$-prefixed parameters");
  it.todo("ARRAY_CONSTRUCT");
  it.todo("OBJECT_CONSTRUCT");
  it.todo("Date format mappings (YYYY -> %Y, etc.)");
  it.todo("SHOW commands");
  it.todo("Stages and warehouses");
  it.todo("QUALIFY clause");
  it.todo("PIVOT / UNPIVOT");
  it.todo("MERGE statement");
  it.todo("INSERT / UPDATE / DELETE");
  it.todo("CREATE OR REPLACE TABLE / VIEW");
  it.todo("SAMPLE / TABLESAMPLE");
  it.todo("LATERAL FLATTEN");
  it.todo("OFFSET without LIMIT -> LIMIT NULL");
});
