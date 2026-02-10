import { describe, it, expect } from "vitest";
import { transpile, Dialect } from "../../src/index.js";

/**
 * Validate that SQL round-trips through parse -> generate using the Presto dialect.
 * If writeSql is provided, the generated output is expected to match writeSql.
 * Otherwise, the output should match the input sql exactly.
 */
function validateIdentity(sql: string, writeSql?: string): void {
  const result = transpile(sql, { readDialect: "presto", writeDialect: "presto" })[0];
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
    readDialect: opts.read ?? "presto",
    writeDialect: opts.write ?? "presto",
  })[0];
  expect(result).toBe(opts.expected);
}

// =============================================================================
// Presto: dialect registration
// =============================================================================

describe("Presto: dialect registration", () => {
  it("registers under 'presto'", () => {
    const d = Dialect.getOrRaise("presto");
    expect(d).toBeDefined();
    expect(d.constructor.name).toBe("Presto");
  });

  it("uses double-quote for identifiers", () => {
    const d = Dialect.getOrRaise("presto");
    expect(d.IDENTIFIER_START).toBe('"');
    expect(d.IDENTIFIER_END).toBe('"');
  });

  it("normalizes functions to uppercase", () => {
    const d = Dialect.getOrRaise("presto");
    expect(d.NORMALIZE_FUNCTIONS).toBe("upper");
  });
});

// =============================================================================
// Trino: dialect registration
// =============================================================================

describe("Trino: dialect registration", () => {
  it("registers under 'trino'", () => {
    const d = Dialect.getOrRaise("trino");
    expect(d).toBeDefined();
    expect(d.constructor.name).toBe("Trino");
  });

  it("uses double-quote for identifiers", () => {
    const d = Dialect.getOrRaise("trino");
    expect(d.IDENTIFIER_START).toBe('"');
    expect(d.IDENTIFIER_END).toBe('"');
  });

  it("normalizes functions to uppercase", () => {
    const d = Dialect.getOrRaise("trino");
    expect(d.NORMALIZE_FUNCTIONS).toBe("upper");
  });

  it("basic identity round-trip", () => {
    const result = transpile("SELECT a FROM test WHERE a = 1", {
      readDialect: "trino",
      writeDialect: "trino",
    })[0];
    expect(result).toBe("SELECT a FROM test WHERE a = 1");
  });

  it("inherits Presto type mappings", () => {
    const result = transpile("SELECT CAST(a AS STRUCT)", {
      readDialect: "",
      writeDialect: "trino",
    })[0];
    expect(result).toBe("SELECT CAST(a AS ROW)");
  });

  it("inherits Presto ILIKE -> LIKE", () => {
    const result = transpile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      readDialect: "",
      writeDialect: "trino",
    })[0];
    expect(result).toBe("SELECT a FROM t WHERE a LIKE '%test%'");
  });
});

// =============================================================================
// Presto: Identity round-trips
// =============================================================================

describe("Presto: identity round-trips", () => {
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
// Presto: WHERE clause
// =============================================================================

describe("Presto: WHERE clause", () => {
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

  it("WHERE with IS NULL", () => {
    validateIdentity("SELECT a FROM test WHERE a IS NULL");
  });
});

// =============================================================================
// Presto: GROUP BY, HAVING, ORDER BY
// =============================================================================

describe("Presto: GROUP BY, HAVING, ORDER BY", () => {
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
});

// =============================================================================
// Presto: JOINs
// =============================================================================

describe("Presto: JOINs", () => {
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
// Presto: Set operations
// =============================================================================

describe("Presto: set operations", () => {
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
// Presto: CTEs
// =============================================================================

describe("Presto: CTEs", () => {
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
// Presto: CASE WHEN
// =============================================================================

describe("Presto: CASE WHEN", () => {
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
// Presto: Type mapping transpilation (Generator TYPE_MAP)
// =============================================================================

describe("Presto: type mappings in CAST", () => {
  it("CAST as STRUCT -> ROW", () => {
    validateTranspile("SELECT CAST(a AS STRUCT)", {
      read: "",
      write: "presto",
      expected: "SELECT CAST(a AS ROW)",
    });
  });

  it("CAST as INT -> INTEGER", () => {
    validateTranspile("SELECT CAST(a AS INT)", {
      read: "",
      write: "presto",
      expected: "SELECT CAST(a AS INTEGER)",
    });
  });

  it("CAST as FLOAT -> REAL", () => {
    validateTranspile("SELECT CAST(a AS FLOAT)", {
      read: "",
      write: "presto",
      expected: "SELECT CAST(a AS REAL)",
    });
  });

  it("CAST as TEXT -> VARCHAR", () => {
    validateTranspile("SELECT CAST(a AS TEXT)", {
      read: "",
      write: "presto",
      expected: "SELECT CAST(a AS VARCHAR)",
    });
  });

  it("CAST as BINARY -> VARBINARY", () => {
    validateTranspile("SELECT CAST(a AS BINARY)", {
      read: "",
      write: "presto",
      expected: "SELECT CAST(a AS VARBINARY)",
    });
  });

  it("CAST as DATETIME -> TIMESTAMP", () => {
    validateTranspile("SELECT CAST(a AS DATETIME)", {
      read: "",
      write: "presto",
      expected: "SELECT CAST(a AS TIMESTAMP)",
    });
  });

  it("CAST as TIMESTAMPTZ -> TIMESTAMP", () => {
    validateTranspile("SELECT CAST(a AS TIMESTAMPTZ)", {
      read: "",
      write: "presto",
      expected: "SELECT CAST(a AS TIMESTAMP)",
    });
  });

  it("CAST as TIMESTAMPNTZ -> TIMESTAMP", () => {
    validateTranspile("SELECT CAST(a AS TIMESTAMPNTZ)", {
      read: "",
      write: "presto",
      expected: "SELECT CAST(a AS TIMESTAMP)",
    });
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

  it("CAST as BOOLEAN stays BOOLEAN", () => {
    validateIdentity("SELECT CAST(a AS BOOLEAN)");
  });
});

// =============================================================================
// Presto: ILIKE -> LIKE transpilation
// =============================================================================

describe("Presto: ILIKE -> LIKE", () => {
  it("ILIKE is converted to LIKE when writing to Presto", () => {
    validateTranspile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      read: "",
      write: "presto",
      expected: "SELECT a FROM t WHERE a LIKE '%test%'",
    });
  });

  it("ILIKE from Postgres is converted to LIKE in Presto", () => {
    validateTranspile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      read: "postgres",
      write: "presto",
      expected: "SELECT a FROM t WHERE a LIKE '%test%'",
    });
  });
});

// =============================================================================
// Presto: Aggregate and window functions
// =============================================================================

describe("Presto: aggregate and window functions", () => {
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
// Presto: Cross-dialect transpilation
// =============================================================================

describe("Presto: cross-dialect transpilation", () => {
  it("Presto to default dialect", () => {
    validateTranspile("SELECT a FROM test", {
      read: "presto",
      write: "",
      expected: "SELECT a FROM test",
    });
  });

  it("default dialect to Presto", () => {
    validateTranspile("SELECT a FROM test", {
      read: "",
      write: "presto",
      expected: "SELECT a FROM test",
    });
  });

  it("Presto quoted identifiers to default", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "presto",
      write: "",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("Presto to Postgres (both use double-quote)", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "presto",
      write: "postgres",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("Presto to BigQuery (double-quote -> backtick)", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "presto",
      write: "bigquery",
      expected: "SELECT `col` FROM `tbl`",
    });
  });

  it("BigQuery to Presto (backtick -> double-quote)", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "bigquery",
      write: "presto",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("Presto to MySQL (double-quote -> backtick)", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "presto",
      write: "mysql",
      expected: "SELECT `col` FROM `tbl`",
    });
  });

  it("MySQL to Presto (backtick -> double-quote)", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "mysql",
      write: "presto",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("Presto to Snowflake (both use double-quote)", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "presto",
      write: "snowflake",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("Presto to DuckDB: TEXT -> TEXT (DuckDB maps VARCHAR -> TEXT)", () => {
    validateTranspile("SELECT CAST(a AS TEXT)", {
      read: "",
      write: "duckdb",
      expected: "SELECT CAST(a AS TEXT)",
    });
  });

  it("Presto CAST FLOAT -> Postgres REAL", () => {
    validateTranspile("SELECT CAST(x AS FLOAT)", {
      read: "presto",
      write: "postgres",
      expected: "SELECT CAST(x AS REAL)",
    });
  });

  it("Presto CAST FLOAT -> BigQuery FLOAT64", () => {
    validateTranspile("SELECT CAST(x AS FLOAT)", {
      read: "presto",
      write: "bigquery",
      expected: "SELECT CAST(x AS FLOAT64)",
    });
  });

  it("Postgres to Presto: BYTEA type stays BYTEA (no reverse mapping)", () => {
    validateTranspile("SELECT CAST(a AS BYTEA)", {
      read: "postgres",
      write: "presto",
      expected: "SELECT CAST(a AS BYTEA)",
    });
  });

  it("Presto STRUCT -> Snowflake OBJECT", () => {
    validateTranspile("SELECT CAST(a AS STRUCT)", {
      read: "",
      write: "snowflake",
      expected: "SELECT CAST(a AS OBJECT)",
    });
  });

  it("Presto to Trino (same dialect family)", () => {
    validateTranspile("SELECT a, CAST(b AS INT) FROM test", {
      read: "presto",
      write: "trino",
      expected: "SELECT a, CAST(b AS INTEGER) FROM test",
    });
  });
});

// =============================================================================
// Presto: Complex queries
// =============================================================================

describe("Presto: complex queries", () => {
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
// Presto: String and numeric literals
// =============================================================================

describe("Presto: string and numeric literals", () => {
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
// Presto: NOT variations
// =============================================================================

describe("Presto: NOT variations", () => {
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
// Presto/Trino: Features not yet implemented (marked as todo)
// =============================================================================

describe("Presto: features not yet implemented", () => {
  it.todo("ROW(...) constructor syntax");
  it.todo("ARRAY[] literal syntax");
  it.todo("Bitwise functions (BITWISE_AND, BITWISE_OR, BITWISE_XOR)");
  it.todo("DATE_ADD / DATE_DIFF / DATE_TRUNC with unit argument reordering");
  it.todo("CARDINALITY (array size)");
  it.todo("SEQUENCE (generate series)");
  it.todo("UNNEST / LATERAL");
  it.todo("APPROX_DISTINCT / APPROX_PERCENTILE");
  it.todo("FROM_UNIXTIME / TO_UNIXTIME");
  it.todo("String encoding functions (TO_UTF8, FROM_UTF8)");
  it.todo("Time format mappings");
  it.todo("JSON functions (JSON_PARSE, JSON_FORMAT)");
  it.todo("MATCH_RECOGNIZE");
  it.todo("QUALIFY elimination");
  it.todo("INSERT / UPDATE / DELETE");
  it.todo("CREATE TABLE / VIEW");
});
