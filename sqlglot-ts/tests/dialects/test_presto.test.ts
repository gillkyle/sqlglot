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
// Presto: Identity round-trips (from Python test_presto.py)
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

  // From Python test_presto: validate_identity("SELECT * FROM (VALUES (1))")
  it("SELECT * FROM (VALUES (1))", () => {
    // TS parser outputs VALUES(1) without space
    validateIdentity("SELECT * FROM (VALUES (1))", "SELECT * FROM (VALUES(1))");
  });

  // From Python: validate_identity("SELECT BOOL_OR(a > 10) FROM asd AS T(a)")
  it("BOOL_OR function", () => {
    validateIdentity("SELECT BOOL_OR(a > 10) FROM t");
  });

  // From Python: validate_identity("APPROX_PERCENTILE(a, b, c, d)")
  it("APPROX_PERCENTILE function", () => {
    validateIdentity("SELECT APPROX_PERCENTILE(a, b, c, d)");
  });

  // From Python: validate_identity("FROM_UNIXTIME(a, b)")
  it("FROM_UNIXTIME with 2 args", () => {
    validateIdentity("SELECT FROM_UNIXTIME(a, b)");
  });

  // From Python: validate_identity("FROM_UNIXTIME(a, b, c)")
  it("FROM_UNIXTIME with 3 args", () => {
    validateIdentity("SELECT FROM_UNIXTIME(a, b, c)");
  });

  // From Python: validate_identity("TRIM(a, b)")
  it("TRIM with 2 args", () => {
    validateIdentity("SELECT TRIM(a, b)");
  });

  // From Python: validate_identity("VAR_POP(a)")
  it("VAR_POP function", () => {
    validateIdentity("SELECT VAR_POP(a)");
  });

  // From Python: validate_identity("FROM_UTF8(x, y)")
  it("FROM_UTF8 with 2 args", () => {
    validateIdentity("SELECT FROM_UTF8(x, y)");
  });

  // From Python: validate_identity("DATE_ADD('DAY', 1, y)")
  it("DATE_ADD identity", () => {
    validateIdentity("SELECT DATE_ADD('DAY', 1, y)");
  });

  // From Python: validate_identity("SELECT CURRENT_USER")
  it("SELECT CURRENT_USER", () => {
    validateIdentity("SELECT CURRENT_USER");
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
// Presto: Type mapping transpilation (from Python test_cast)
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

  it("CAST as INTEGER stays INTEGER", () => {
    validateIdentity("SELECT CAST(a AS INTEGER)");
  });

  it("CAST(x AS TIMESTAMP) identity", () => {
    validateIdentity("SELECT CAST(x AS TIMESTAMP)");
  });

  // From Python: CAST(a AS VARCHAR) cross-dialect
  it("CAST(a AS VARCHAR) -> BigQuery STRING", () => {
    validateTranspile("SELECT CAST(a AS VARCHAR)", {
      read: "presto",
      write: "bigquery",
      expected: "SELECT CAST(a AS STRING)",
    });
  });

  it("CAST(a AS VARCHAR) -> DuckDB TEXT", () => {
    validateTranspile("SELECT CAST(a AS VARCHAR)", {
      read: "presto",
      write: "duckdb",
      expected: "SELECT CAST(a AS TEXT)",
    });
  });

  // From Python: CAST('10C' AS INTEGER) read from postgres/redshift
  it("CAST('10C' AS INTEGER) from postgres", () => {
    validateTranspile("SELECT CAST('10C' AS INTEGER)", {
      read: "postgres",
      write: "presto",
      expected: "SELECT CAST('10C' AS INTEGER)",
    });
  });

  it("CAST('10C' AS INTEGER) from redshift", () => {
    validateTranspile("SELECT CAST('10C' AS INTEGER)", {
      read: "redshift",
      write: "presto",
      expected: "SELECT CAST('10C' AS INTEGER)",
    });
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
// Presto: test_replace (from Python)
// =============================================================================

describe("Presto: REPLACE function", () => {
  it("REPLACE(subject, pattern, replacement) identity", () => {
    validateIdentity("SELECT REPLACE(subject, pattern, replacement)");
  });

  it("REPLACE cross-dialect reads", () => {
    validateTranspile("SELECT REPLACE(subject, pattern, replacement)", {
      read: "bigquery",
      write: "presto",
      expected: "SELECT REPLACE(subject, pattern, replacement)",
    });
  });

  it("REPLACE -> BigQuery", () => {
    validateTranspile("SELECT REPLACE(subject, pattern, replacement)", {
      read: "presto",
      write: "bigquery",
      expected: "SELECT REPLACE(subject, pattern, replacement)",
    });
  });

  it("REPLACE -> DuckDB", () => {
    validateTranspile("SELECT REPLACE(subject, pattern, replacement)", {
      read: "presto",
      write: "duckdb",
      expected: "SELECT REPLACE(subject, pattern, replacement)",
    });
  });

  it("REPLACE -> Snowflake", () => {
    validateTranspile("SELECT REPLACE(subject, pattern, replacement)", {
      read: "presto",
      write: "snowflake",
      expected: "SELECT REPLACE(subject, pattern, replacement)",
    });
  });
});

// =============================================================================
// Presto: test_regex (from Python)
// =============================================================================

describe("Presto: regex functions", () => {
  it("REGEXP_REPLACE identity", () => {
    validateIdentity("SELECT REGEXP_REPLACE('abcd', '[ab]')");
  });

  it("REGEXP_LIKE identity", () => {
    validateIdentity("SELECT REGEXP_LIKE(a, 'x')");
  });

  it("SPLIT identity", () => {
    validateIdentity("SELECT SPLIT(x, 'a.')");
  });

  it("REGEXP_SPLIT identity", () => {
    validateIdentity("SELECT REGEXP_SPLIT(x, 'a.')");
  });

  it("CARDINALITY identity", () => {
    validateIdentity("SELECT CARDINALITY(x)");
  });

  it("ARRAY_JOIN identity", () => {
    validateIdentity("SELECT ARRAY_JOIN(x, '-', 'a')");
  });

  it("STRPOS identity", () => {
    validateIdentity("SELECT STRPOS(haystack, needle)");
  });
});

// =============================================================================
// Presto: test_time (from Python - identity tests)
// =============================================================================

describe("Presto: time functions (identity)", () => {
  it("FROM_UNIXTIME(col) identity", () => {
    validateIdentity("SELECT FROM_UNIXTIME(col) FROM tbl");
  });

  it("DATE_FORMAT identity", () => {
    validateIdentity("SELECT DATE_FORMAT(x, '%Y-%m-%d')");
  });

  it("DATE_PARSE identity", () => {
    validateIdentity("SELECT DATE_PARSE(x, '%Y-%m-%d')");
  });

  it("TO_UNIXTIME identity", () => {
    validateIdentity("SELECT TO_UNIXTIME(x)");
  });

  it("DATE_ADD identity", () => {
    validateIdentity("SELECT DATE_ADD('DAY', 1, x)");
  });
});

// =============================================================================
// Presto: test_quotes (from Python)
// =============================================================================

describe("Presto: quote handling", () => {
  // From Python: self.validate_all("''''", write={"presto": "''''", ...})
  it("escaped single quote identity", () => {
    validateIdentity("SELECT ''''");
  });

  // From Python: self.validate_all("'x'", write={"presto": "'x'", ...})
  it("simple string identity", () => {
    validateIdentity("SELECT 'x'");
  });

  // From Python: self.validate_all("'''x'''", write={"presto": "'''x'''", ...})
  it("string with escaped quotes", () => {
    validateIdentity("SELECT '''x'''");
  });

  // From Python: self.validate_all("'''x'", write={"presto": "'''x'", ...})
  it("string with leading escaped quote", () => {
    validateIdentity("SELECT '''x'");
  });

  // From Python: self.validate_all("x IN ('a', 'a''b')", write={"presto": "x IN ('a', 'a''b')", ...})
  it("IN with escaped quote in string", () => {
    validateIdentity("SELECT x IN ('a', 'a''b')");
  });

  // Cross-dialect quote tests with available dialects
  it("escaped quote -> DuckDB", () => {
    validateTranspile("SELECT ''''", {
      read: "presto",
      write: "duckdb",
      expected: "SELECT ''''",
    });
  });
});

// =============================================================================
// Presto: test_presto - function identities (from Python)
// =============================================================================

describe("Presto: function identities (from test_presto)", () => {
  it("ROW(1, 2) identity", () => {
    validateIdentity("SELECT ROW(1, 2)");
  });

  it("STARTS_WITH identity", () => {
    validateIdentity("SELECT STARTS_WITH('abc', 'a')");
  });

  it("IS_NAN identity", () => {
    validateIdentity("SELECT IS_NAN(x)");
  });

  it("ARBITRARY identity", () => {
    validateIdentity("SELECT ARBITRARY(x)");
  });

  it("APPROX_DISTINCT identity", () => {
    validateIdentity("SELECT APPROX_DISTINCT(a) FROM foo");
  });

  it("APPROX_DISTINCT with accuracy identity", () => {
    validateIdentity("SELECT APPROX_DISTINCT(a, 0.1) FROM foo");
  });

  it("JSON_EXTRACT identity", () => {
    validateIdentity("SELECT JSON_EXTRACT(x, '$.name')");
  });

  it("JSON_EXTRACT_SCALAR identity", () => {
    validateIdentity("SELECT JSON_EXTRACT_SCALAR(x, '$.name')");
  });

  it("ARRAY_SORT identity", () => {
    validateIdentity("SELECT ARRAY_SORT(x)");
  });

  it("JSON_FORMAT identity", () => {
    validateIdentity("SELECT JSON_FORMAT(x)");
  });

  it("REGEXP_EXTRACT identity", () => {
    validateIdentity("SELECT REGEXP_EXTRACT('abc', '(a)(b)(c)')");
  });

  it("MAX_BY identity", () => {
    validateIdentity("SELECT MAX_BY(a.id, a.timestamp) FROM a");
  });

  it("MIN_BY identity", () => {
    validateIdentity("SELECT MIN_BY(a.id, a.timestamp, 3) FROM a");
  });

  it("SIGN identity", () => {
    validateIdentity("SELECT SIGN(x)");
  });

  it("SUBSTRING identity", () => {
    validateIdentity("SELECT SUBSTRING(a, 1, 3)");
  });

  it("LAST_DAY_OF_MONTH identity", () => {
    validateIdentity("SELECT LAST_DAY_OF_MONTH(CAST('2008-11-25' AS DATE))");
  });

  it("INITCAP identity", () => {
    validateIdentity("SELECT INITCAP(col)");
  });

  // From Python: 'SELECT a."b" FROM "foo"'
  it("mixed quoted identifier identity", () => {
    validateIdentity('SELECT a."b" FROM "foo"');
  });
});

// =============================================================================
// Presto: test_encode_decode (from Python)
// =============================================================================

describe("Presto: encode/decode functions", () => {
  it("TO_UTF8 identity", () => {
    validateIdentity("SELECT TO_UTF8(x)");
  });

  it("FROM_UTF8 identity", () => {
    validateIdentity("SELECT FROM_UTF8(x)");
  });

  it("FROM_UTF8 with replacement identity", () => {
    validateIdentity("SELECT FROM_UTF8(x, y)");
  });
});

// =============================================================================
// Presto: test_hex_unhex (from Python)
// =============================================================================

describe("Presto: hex functions", () => {
  it("TO_HEX identity", () => {
    validateIdentity("SELECT TO_HEX(x)");
  });

  it("FROM_HEX identity", () => {
    validateIdentity("SELECT FROM_HEX(x)");
  });
});

// =============================================================================
// Presto: test_cast (from Python) - cross-dialect with available dialects
// =============================================================================

describe("Presto: cross-dialect CAST transpilation", () => {
  it("CAST(x AS BOOLEAN) identity", () => {
    validateIdentity("SELECT CAST(x AS BOOLEAN)");
  });

  it("CAST(x AS TIMESTAMP) identity", () => {
    validateIdentity("SELECT CAST(x AS TIMESTAMP)");
  });

  // From Python: FROM_BASE64 / TO_BASE64
  it("FROM_BASE64 identity", () => {
    validateIdentity("SELECT FROM_BASE64(x)");
  });

  it("TO_BASE64 identity", () => {
    validateIdentity("SELECT TO_BASE64(x)");
  });
});

// =============================================================================
// Presto: test_signum (from Python)
// =============================================================================

describe("Presto: SIGN/SIGNUM", () => {
  it("SIGN identity", () => {
    validateIdentity("SELECT SIGN(x)");
  });
});

// =============================================================================
// Presto: test_bit_aggs (from Python)
// =============================================================================

describe("Presto: bitwise aggregate functions", () => {
  it("BITWISE_AND_AGG identity", () => {
    validateIdentity("SELECT BITWISE_AND_AGG(x)");
  });

  it("BITWISE_OR_AGG identity", () => {
    validateIdentity("SELECT BITWISE_OR_AGG(x)");
  });

  it("BITWISE_XOR_AGG identity", () => {
    validateIdentity("SELECT BITWISE_XOR_AGG(x)");
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

  // From Python: window functions identity
  it("FIRST_VALUE, NTH_VALUE, LAST_VALUE window functions", () => {
    validateIdentity(
      "SELECT id, FIRST_VALUE(is_deleted) OVER (PARTITION BY id) AS first_is_deleted, NTH_VALUE(is_deleted, 2) OVER (PARTITION BY id) AS nth_is_deleted, LAST_VALUE(is_deleted) OVER (PARTITION BY id) AS last_is_deleted FROM my_table",
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

  // From Python: 'SELECT a."b" FROM "foo"' -> spark/duckdb
  it('Presto "quoted" identifiers -> DuckDB', () => {
    validateTranspile('SELECT a."b" FROM "foo"', {
      read: "presto",
      write: "duckdb",
      expected: 'SELECT a."b" FROM "foo"',
    });
  });

  // From Python: SELECT NULLABLE FROM system.jdbc.types
  // NULLABLE is a reserved keyword in the TS parser, can't be used as column name yet
  it.todo("NULLABLE as column name");
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

  // From Python: '\u6bdb' (CJK character)
  it("CJK character in string", () => {
    validateIdentity("SELECT '\u6bdb'");
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
// Trino: test_trino (from Python test_trino.py)
// =============================================================================

describe("Trino: identity tests", () => {
  const trinoIdentity = (sql: string, writeSql?: string) => {
    const result = transpile(sql, { readDialect: "trino", writeDialect: "trino" })[0];
    expect(result).toBe(writeSql ?? sql);
  };

  it("SELECT VERSION()", () => {
    trinoIdentity("SELECT VERSION()");
  });
});

// =============================================================================
// Presto/Trino: Features not yet implemented (from Python test files)
// =============================================================================

describe("Presto: test_cast - not yet implemented", () => {
  // Requires CAST(x AS IPADDRESS) and other custom types
  it.todo("CAST(x AS IPADDRESS)");
  it.todo("CAST(x AS IPPREFIX)");
  it.todo("CAST(x AS HYPERLOGLOG)");
  it.todo("CAST(x AS TDIGEST)");
  // Requires TIMESTAMP '...' literal syntax
  it.todo("TIMESTAMP '2025-06-20 11:22:29 Europe/Prague' -> CAST");
  // Requires FROM_ISO8601_TIMESTAMP transpilation
  it.todo("FROM_ISO8601_TIMESTAMP -> DuckDB TIMESTAMPTZ");
  // Requires INTERVAL YEAR TO MONTH / DAY TO SECOND
  it.todo("CAST(x AS INTERVAL YEAR TO MONTH)");
  it.todo("CAST(x AS INTERVAL DAY TO SECOND)");
  // Requires ARRAY(INT) and MAP(VARCHAR, INT) type syntax in CAST
  it.todo("CAST(a AS ARRAY(INT)) cross-dialect");
  it.todo("CAST(ARRAY[1, 2] AS ARRAY(BIGINT)) cross-dialect");
  it.todo("CAST(MAP(ARRAY['key'], ARRAY[1]) AS MAP(VARCHAR, INT)) cross-dialect");
  it.todo("CAST(x AS TIME(5) WITH TIME ZONE)");
  it.todo("CAST(x AS TIMESTAMP(9) WITH TIME ZONE)");
  // Requires Postgres ::TIMESTAMP epoch casting
  it.todo("SELECT 'epoch'::TIMESTAMP from Postgres");
});

describe("Presto: test_replace - not yet implemented", () => {
  // Requires REPLACE(subject, pattern) -> REPLACE(subject, pattern, '') transpilation
  it.todo("REPLACE(subject, pattern) with 2 args -> adds empty string");
});

describe("Presto: test_regex - not yet implemented", () => {
  // Requires cross-dialect transpilation of regex functions
  it.todo("REGEXP_REPLACE -> DuckDB/Spark transpilation");
  it.todo("REGEXP_LIKE -> DuckDB REGEXP_MATCHES / Hive RLIKE");
  it.todo("SPLIT -> DuckDB STR_SPLIT");
  it.todo("REGEXP_SPLIT -> DuckDB STR_SPLIT_REGEX");
  it.todo("CARDINALITY -> DuckDB ARRAY_LENGTH");
  it.todo("STRPOS with occurrence -> BigQuery INSTR");
});

describe("Presto: test_interval_plural_to_singular - not yet implemented", () => {
  it.todo("INTERVAL '1' seconds -> INTERVAL '1' SECOND");
  it.todo("INTERVAL '1' minutes -> INTERVAL '1' MINUTE");
  it.todo("INTERVAL '1' hours -> INTERVAL '1' HOUR");
  it.todo("INTERVAL '1' days -> INTERVAL '1' DAY");
  it.todo("INTERVAL '1' months -> INTERVAL '1' MONTH");
  it.todo("INTERVAL '1' years -> INTERVAL '1' YEAR");
});

describe("Presto: test_time - not yet implemented", () => {
  it.todo("FROM_UNIXTIME -> DuckDB TO_TIMESTAMP");
  it.todo("DATE_FORMAT -> DuckDB STRFTIME / BigQuery FORMAT_DATE");
  it.todo("DATE_PARSE -> DuckDB STRPTIME");
  it.todo("TO_UNIXTIME -> DuckDB EPOCH");
  it.todo("DATE_ADD -> DuckDB INTERVAL");
  it.todo("NOW() -> CURRENT_TIMESTAMP");
  it.todo("DAY_OF_WEEK / DAY_OF_MONTH / DAY_OF_YEAR");
  it.todo("WEEK_OF_YEAR");
  it.todo("AT_TIMEZONE");
  it.todo("TIMESTAMP literal -> CAST");
  it.todo("DATE_ADD with BIGINT cast");
});

describe("Presto: test_ddl - not yet implemented", () => {
  it.todo("CREATE TABLE ... WITH (FORMAT = 'PARQUET')");
  it.todo("CREATE TABLE ... WITH (PARTITIONED_BY=ARRAY[...])");
  it.todo("CREATE TABLE with ROW() type");
  it.todo("CREATE TABLE with nested ROW() types");
  it.todo("CREATE OR REPLACE VIEW");
  it.todo("CREATE TABLE IF NOT EXISTS with COMMENT and PARTITIONED BY");
  it.todo("CREATE OR REPLACE VIEW ... SECURITY DEFINER");
  it.todo("CREATE OR REPLACE VIEW ... SECURITY INVOKER");
  it.todo("ORDER BY with NULLS FIRST / NULLS LAST");
});

describe("Presto: test_unnest - not yet implemented", () => {
  it.todo("CROSS JOIN UNNEST(ARRAY(y))");
  it.todo("CROSS JOIN UNNEST with additional JOINs");
});

describe("Presto: test_unicode_string - not yet implemented", () => {
  it.todo("U&'Hello winter \\2603 !' Unicode string");
  it.todo("U&'...' UESCAPE '#'");
});

describe("Presto: test_presto - not yet implemented", () => {
  // ARRAY literal syntax
  it.todo("SELECT ARRAY[1, 2] identity");
  it.todo("ARRAY[1, 2] -> BigQuery [...] / DuckDB [...]");
  // ELEMENT_AT
  it.todo("ELEMENT_AT(ARRAY[1,2,3], 4) cross-dialect");
  // UNNEST
  it.todo("UNNEST(ARRAY['7', '14']) cross-dialect");
  // VALUES / RECURSIVE CTE
  it.todo("VALUES 1, 2, 3 -> VALUES (1), (2), (3)");
  it.todo("WITH RECURSIVE CTE transpilation");
  // MAP operations
  it.todo("MAP(a, b) cross-dialect");
  it.todo("MAP(ARRAY(a, b), ARRAY(c, d)) cross-dialect");
  // JSON operations
  it.todo("JSON '\"foo\"' -> JSON_PARSE / PARSE_JSON");
  it.todo("JSON_FORMAT(x) -> BigQuery TO_JSON_STRING / DuckDB CAST(TO_JSON(...))");
  // ARRAY_SORT with lambda
  it.todo("ARRAY_SORT(x, (left, right) -> -1) cross-dialect");
  // ARRAY_AGG with ORDER BY
  it.todo("ARRAY_AGG(x ORDER BY y DESC) cross-dialect");
  // GROUP BY with CUBE/ROLLUP/GROUPING SETS
  it.todo("GROUP BY CUBE / ROLLUP / GROUPING SETS");
  // ARBITRARY -> ANY_VALUE cross-dialect
  it.todo("ARBITRARY(x) -> BigQuery/DuckDB ANY_VALUE(x)");
  // STARTS_WITH cross-dialect
  it.todo("STARTS_WITH -> Snowflake STARTSWITH");
  // IS_NAN cross-dialect
  it.todo("IS_NAN -> Spark ISNAN");
  // OFFSET LIMIT ordering
  it.todo("SELECT * FROM x OFFSET 1 LIMIT 1");
  it.todo("SELECT * FROM x OFFSET 1 FETCH FIRST 1 ROWS ONLY");
  // TABLESAMPLE
  it.todo("SELECT a FROM test TABLESAMPLE BERNOULLI (50)");
  it.todo("SELECT a FROM test TABLESAMPLE SYSTEM (75)");
  // ROLLUP / CUBE in GROUP BY
  it.todo("GROUP BY a, ROLLUP (b), ROLLUP (c)");
  // JSON_OBJECT
  it.todo("JSON_OBJECT(KEY 'key1' VALUE 1, KEY 'key2' VALUE TRUE)");
  // INTERVAL
  it.todo("INTERVAL '1 day'");
  it.todo("INTERVAL '5' WEEK -> 5 * INTERVAL '7' DAY");
  // SPLIT_TO_MAP
  it.todo("SPLIT_TO_MAP with lambda");
  // FOR VERSION / TIMESTAMP AS OF
  it.todo("SELECT * FROM table FOR VERSION AS OF ...");
  it.todo("SELECT * FROM table FOR TIMESTAMP AS OF ...");
  // TRUNCATE (numeric)
  it.todo("TRUNCATE(3.14159, 2) as Trunc expression");
  // string_agg -> ARRAY_JOIN(ARRAY_AGG(...))
  it.todo("string_agg -> ARRAY_JOIN(ARRAY_AGG(...))");
  // REGEXP_EXTRACT cross-dialect
  it.todo("REGEXP_EXTRACT cross-dialect with DuckDB/Snowflake");
  // CURRENT_USER cross-dialect
  it.todo("CURRENT_USER -> Snowflake CURRENT_USER()");
  // START TRANSACTION
  it.todo("START TRANSACTION READ WRITE, ISOLATION LEVEL SERIALIZABLE");
  // DEALLOCATE PREPARE / DESCRIBE / RESET SESSION
  it.todo("DEALLOCATE PREPARE (command)");
  it.todo("DESCRIBE INPUT/OUTPUT (command)");
  it.todo("RESET SESSION (command)");
});

describe("Presto: test_encode_decode - not yet implemented", () => {
  it.todo("TO_UTF8 -> DuckDB ENCODE / Spark ENCODE('utf-8')");
  it.todo("FROM_UTF8 -> DuckDB DECODE / Spark DECODE('utf-8')");
  it.todo("ENCODE with invalid encoding -> UnsupportedError");
  it.todo("DECODE with invalid encoding -> UnsupportedError");
});

describe("Presto: test_hex_unhex - not yet implemented", () => {
  it.todo("TO_HEX -> Spark HEX");
  it.todo("FROM_HEX -> Spark UNHEX");
  it.todo("HEX(x) -> Presto TO_HEX(x)");
  it.todo("UNHEX(x) -> Presto FROM_HEX(x)");
});

describe("Presto: test_json - not yet implemented", () => {
  it.todo("JSON_EXTRACT with complex nested expressions");
  it.todo("CAST(JSON '[1,23,456]' AS ARRAY(INTEGER))");
  it.todo("CAST(JSON '{...}' AS MAP(VARCHAR, INTEGER))");
  it.todo("CAST(ARRAY [...] AS JSON)");
});

describe("Presto: test_match_recognize - not yet implemented", () => {
  it.todo("MATCH_RECOGNIZE with PARTITION BY, MEASURES, PATTERN, DEFINE");
});

describe("Presto: test_to_char - not yet implemented", () => {
  it.todo("TO_CHAR(ts, 'dd') -> DATE_FORMAT(ts, '%d')");
  it.todo("TO_CHAR(ts, 'hh') -> DATE_FORMAT(ts, '%H')");
  it.todo("TO_CHAR(ts, 'hh24') -> DATE_FORMAT(ts, '%H')");
  it.todo("TO_CHAR(ts, 'mi') -> DATE_FORMAT(ts, '%i')");
  it.todo("TO_CHAR(ts, 'mm') -> DATE_FORMAT(ts, '%m')");
  it.todo("TO_CHAR(ts, 'ss') -> DATE_FORMAT(ts, '%s')");
  it.todo("TO_CHAR(ts, 'yyyy') -> DATE_FORMAT(ts, '%Y')");
  it.todo("TO_CHAR(ts, 'yy') -> DATE_FORMAT(ts, '%y')");
});

describe("Presto: test_json_vs_row_extract - not yet implemented", () => {
  it.todo("Snowflake col:x:y -> Presto JSON_EXTRACT with variant_extract_is_json_extract");
  it.todo("Snowflake col:x:y -> Presto dot notation with variant_extract_is_json_extract=false");
});

describe("Presto: test_analyze - not yet implemented", () => {
  it.todo("ANALYZE tbl");
  it.todo("ANALYZE tbl WITH (prop1=val1, prop2=val2)");
});

describe("Presto: test_initcap - not yet implemented", () => {
  it.todo("INITCAP(col) -> REGEXP_REPLACE with lambda");
});

// =============================================================================
// Trino: not yet implemented (from Python test_trino.py)
// =============================================================================

describe("Trino: test_trino - not yet implemented", () => {
  it.todo("REFRESH MATERIALIZED VIEW");
  it.todo("JSON_QUERY with lax/strict path modes");
  it.todo("JSON_QUERY with WRAPPER options");
  it.todo("JSON_QUERY with QUOTES options");
  it.todo("JSON_EXTRACT identity");
  it.todo("TIMESTAMP '2012-10-31 01:00 -2' -> CAST(...AS TIMESTAMP WITH TIME ZONE)");
  it.todo("TIMESTAMP with timezone -> DuckDB TIMESTAMPTZ");
  it.todo("FORMAT('%s', 123) -> DuckDB/Snowflake");
  it.todo("MATCH_RECOGNIZE with FIRST/LAST");
});

describe("Trino: test_listagg - not yet implemented", () => {
  it.todo("LISTAGG(DISTINCT col, ',') WITHIN GROUP");
  it.todo("LISTAGG with ON OVERFLOW ERROR");
  it.todo("LISTAGG with ON OVERFLOW TRUNCATE WITH/WITHOUT COUNT");
  it.todo("LISTAGG with default separator");
});

describe("Trino: test_trim - not yet implemented", () => {
  it.todo("TRIM('!' FROM '!foo!')");
  it.todo("TRIM(BOTH '$' FROM '$var$')");
  it.todo("TRIM(TRAILING 'ER' FROM UPPER('worker'))");
  it.todo("TRIM(LEADING FROM '  abcd') -> LTRIM");
  it.todo("TRIM('!foo!', '!') -> TRIM('!' FROM '!foo!')");
});

describe("Trino: test_ddl - not yet implemented", () => {
  it.todo("ALTER TABLE RENAME TO");
  it.todo("ALTER TABLE ADD COLUMN");
  it.todo("ALTER TABLE DROP COLUMN");
  it.todo("ALTER TABLE RENAME COLUMN");
  it.todo("ALTER TABLE ALTER COLUMN SET DATA TYPE");
  it.todo("ALTER TABLE ALTER COLUMN DROP NOT NULL");
  it.todo("ALTER TABLE SET AUTHORIZATION");
  it.todo("ALTER TABLE SET PROPERTIES");
  it.todo("ALTER VIEW RENAME TO");
  it.todo("ALTER VIEW SET AUTHORIZATION");
  it.todo("CREATE SCHEMA WITH (LOCATION=...)");
  it.todo("CREATE TABLE WITH (LOCATION=...)");
  it.todo("CREATE TABLE WITH (PARTITIONED_BY=ARRAY[...]) - Hive connector");
  it.todo("CREATE TABLE WITH (PARTITIONING=ARRAY[...]) - Iceberg connector");
});

describe("Trino: test_analyze - not yet implemented", () => {
  it.todo("ANALYZE tbl");
  it.todo("ANALYZE tbl WITH (prop1=val1, prop2=val2)");
});

describe("Trino: test_json_value - not yet implemented", () => {
  it.todo("JSON_VALUE with RETURNING type");
  it.todo("JSON_VALUE with strict/lax path");
  it.todo("JSON_VALUE with RETURNING DECIMAL");
  it.todo("JSON_VALUE with ON EMPTY / ON ERROR");
});
