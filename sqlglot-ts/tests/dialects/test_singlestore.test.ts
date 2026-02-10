import { describe, it, expect } from "vitest";
import { transpile, Dialect } from "../../src/index.js";

/**
 * Validate that SQL round-trips through parse -> generate using the SingleStore dialect.
 * If writeSql is provided, the generated output is expected to match writeSql.
 * Otherwise, the output should match the input sql exactly.
 */
function validateIdentity(sql: string, writeSql?: string): void {
  const result = transpile(sql, { readDialect: "singlestore", writeDialect: "singlestore" })[0];
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
    readDialect: opts.read ?? "singlestore",
    writeDialect: opts.write ?? "singlestore",
  })[0];
  expect(result).toBe(opts.expected);
}

// =============================================================================
// SingleStore dialect registration
// =============================================================================

describe("SingleStore: dialect registration", () => {
  it("registers under 'singlestore'", () => {
    const d = Dialect.getOrRaise("singlestore");
    expect(d).toBeDefined();
    expect(d.constructor.name).toBe("SingleStore");
  });

  it("uses backtick for identifiers (inherited from MySQL)", () => {
    const d = Dialect.getOrRaise("singlestore");
    expect(d.IDENTIFIER_START).toBe("`");
    expect(d.IDENTIFIER_END).toBe("`");
  });
});

// =============================================================================
// SingleStore: Identity round-trips (basic SQL)
// =============================================================================

describe("SingleStore: identity round-trips", () => {
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

  it("SELECT with multiple columns", () => {
    validateIdentity("SELECT a, b, c FROM test");
  });

  it("SELECT with expressions", () => {
    validateIdentity("SELECT a + b AS total FROM test");
  });

  it("WHERE clause", () => {
    validateIdentity("SELECT a FROM test WHERE a = 1");
  });

  it("WHERE with AND", () => {
    validateIdentity("SELECT a FROM test WHERE a = 1 AND b = 2");
  });

  it("GROUP BY and HAVING", () => {
    validateIdentity(
      "SELECT a, COUNT(*) FROM test GROUP BY a HAVING COUNT(*) > 1",
    );
  });

  it("ORDER BY", () => {
    validateIdentity("SELECT a FROM test ORDER BY a DESC");
  });

  it("JOIN", () => {
    validateIdentity("SELECT 1 FROM a JOIN b ON a.x = b.x");
  });

  it("subquery in FROM", () => {
    validateIdentity("SELECT a FROM (SELECT a FROM test) AS t");
  });

  it("CTE", () => {
    validateIdentity("WITH cte AS (SELECT 1) SELECT * FROM cte");
  });

  it("UNION ALL", () => {
    validateIdentity("SELECT 1 UNION ALL SELECT 2");
  });

  it("CASE WHEN", () => {
    validateIdentity(
      "SELECT CASE WHEN a > 1 THEN 'yes' ELSE 'no' END FROM test",
    );
  });

  it("NULL literal", () => {
    validateIdentity("SELECT NULL");
  });

  it("TRUE / FALSE", () => {
    validateIdentity("SELECT TRUE");
    validateIdentity("SELECT FALSE");
  });

  it("IN list", () => {
    validateIdentity("SELECT a FROM test WHERE a IN (1, 2, 3)");
  });

  it("BETWEEN", () => {
    validateIdentity("SELECT a FROM test WHERE a BETWEEN 1 AND 10");
  });

  it("LIKE", () => {
    validateIdentity("SELECT a FROM test WHERE a LIKE '%test%'");
  });

  it("IS NULL", () => {
    validateIdentity("SELECT a FROM test WHERE a IS NULL");
  });

  it("window function", () => {
    validateIdentity("SELECT ROW_NUMBER() OVER (ORDER BY a) FROM test");
  });

  it("aggregate functions", () => {
    validateIdentity("SELECT COUNT(*) FROM test");
    validateIdentity("SELECT SUM(a) FROM test");
    validateIdentity("SELECT COALESCE(a, b) FROM test");
  });
});

// =============================================================================
// SingleStore: Cast operator generation (`:>`)
// =============================================================================

describe("SingleStore: CAST -> :> operator", () => {
  it("CAST(x AS INT) -> x :> INT", () => {
    validateTranspile("SELECT CAST(x AS INT)", {
      read: "",
      write: "singlestore",
      expected: "SELECT x :> INT",
    });
  });

  it("CAST(x AS TEXT) -> x :> TEXT", () => {
    validateTranspile("SELECT CAST(x AS TEXT)", {
      read: "",
      write: "singlestore",
      expected: "SELECT x :> TEXT",
    });
  });

  it("CAST(x AS BIGINT) -> x :> BIGINT", () => {
    validateTranspile("SELECT CAST(x AS BIGINT)", {
      read: "",
      write: "singlestore",
      expected: "SELECT x :> BIGINT",
    });
  });

  it("CAST(x AS BOOLEAN) -> x :> BOOLEAN", () => {
    validateTranspile("SELECT CAST(x AS BOOLEAN)", {
      read: "",
      write: "singlestore",
      expected: "SELECT x :> BOOLEAN",
    });
  });

  it("CAST(x AS DATE) -> x :> DATE", () => {
    validateTranspile("SELECT CAST(x AS DATE)", {
      read: "",
      write: "singlestore",
      expected: "SELECT x :> DATE",
    });
  });

  it("CAST(x AS DOUBLE) -> x :> DOUBLE", () => {
    validateTranspile("SELECT CAST(x AS DOUBLE)", {
      read: "",
      write: "singlestore",
      expected: "SELECT x :> DOUBLE",
    });
  });

  it("CAST with column expression", () => {
    validateTranspile("SELECT CAST(a + b AS INT) FROM test", {
      read: "",
      write: "singlestore",
      expected: "SELECT a + b :> INT FROM test",
    });
  });
});

// =============================================================================
// SingleStore: TryCast operator generation (`!:>`)
// =============================================================================

describe("SingleStore: TRY_CAST -> !:> operator", () => {
  it.todo("TRY_CAST(x AS INT) -> x !:> INT (requires TRY_CAST parser support)");
  it.todo("TRY_CAST(x AS TEXT) -> x !:> TEXT (requires TRY_CAST parser support)");
  it.todo("TRY_CAST(x AS DOUBLE) -> x !:> DOUBLE (requires TRY_CAST parser support)");
});

// =============================================================================
// SingleStore: Type mapping transpilation
// =============================================================================

describe("SingleStore: type mappings", () => {
  it("JSONB -> BSON", () => {
    validateTranspile("SELECT CAST(x AS JSONB)", {
      read: "",
      write: "singlestore",
      expected: "SELECT x :> BSON",
    });
  });

  it("STRUCT -> RECORD", () => {
    validateTranspile("SELECT CAST(x AS STRUCT)", {
      read: "",
      write: "singlestore",
      expected: "SELECT x :> RECORD",
    });
  });

  it("GEOMETRY -> GEOGRAPHY", () => {
    validateTranspile("SELECT CAST(x AS GEOMETRY)", {
      read: "",
      write: "singlestore",
      expected: "SELECT x :> GEOGRAPHY",
    });
  });

  it("BIT -> BOOLEAN", () => {
    validateTranspile("SELECT CAST(x AS BIT)", {
      read: "",
      write: "singlestore",
      expected: "SELECT x :> BOOLEAN",
    });
  });

  it("BIGDECIMAL -> DECIMAL", () => {
    validateTranspile("SELECT CAST(x AS BIGDECIMAL)", {
      read: "",
      write: "singlestore",
      expected: "SELECT x :> DECIMAL",
    });
  });

  it("DATE stays DATE", () => {
    validateTranspile("SELECT CAST(x AS DATE)", {
      read: "",
      write: "singlestore",
      expected: "SELECT x :> DATE",
    });
  });

  it("INT stays INT", () => {
    validateTranspile("SELECT CAST(x AS INT)", {
      read: "",
      write: "singlestore",
      expected: "SELECT x :> INT",
    });
  });
});

// =============================================================================
// SingleStore: Backtick identifier quoting (inherited from MySQL)
// =============================================================================

describe("SingleStore: backtick identifier quoting", () => {
  it("backtick-quoted identifiers round-trip", () => {
    validateIdentity("SELECT `a` FROM `b`");
  });

  it("backtick-quoted table.column round-trip", () => {
    validateIdentity("SELECT `a`.`b` FROM `a`");
  });

  it("mixed quoted and unquoted identifiers", () => {
    validateIdentity("SELECT `a`.b FROM a");
  });

  it("unquoted identifiers remain unquoted", () => {
    validateIdentity("SELECT a FROM b");
  });
});

// =============================================================================
// SingleStore: Cross-dialect transpilation
// =============================================================================

describe("SingleStore: cross-dialect transpilation", () => {
  it("SingleStore to default dialect: backtick -> double-quote", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "singlestore",
      write: "",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("default dialect to SingleStore: double-quote -> backtick", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "",
      write: "singlestore",
      expected: "SELECT `col` FROM `tbl`",
    });
  });

  it("SingleStore to Postgres: backtick -> double-quote", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "singlestore",
      write: "postgres",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("Postgres to SingleStore: double-quote -> backtick", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "postgres",
      write: "singlestore",
      expected: "SELECT `col` FROM `tbl`",
    });
  });

  it("MySQL to SingleStore: basic SQL passes through", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "mysql",
      write: "singlestore",
      expected: "SELECT `col` FROM `tbl`",
    });
  });

  it("SingleStore to MySQL: CAST changes from :> to CAST()", () => {
    validateTranspile("SELECT CAST(x AS INT)", {
      read: "",
      write: "mysql",
      expected: "SELECT CAST(x AS INT)",
    });
  });

  it("default CAST to SingleStore uses :> operator", () => {
    validateTranspile("SELECT CAST(x AS VARCHAR)", {
      read: "",
      write: "singlestore",
      expected: "SELECT x :> VARCHAR",
    });
  });

  it.todo("default TRY_CAST to SingleStore uses !:> operator (requires TRY_CAST parser support)");

  it("ILIKE from default to SingleStore transpiled to LIKE", () => {
    const result = transpile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      readDialect: "",
      writeDialect: "singlestore",
    })[0];
    expect(result).toBe("SELECT a FROM t WHERE a LIKE '%test%'");
  });

  it("BigQuery CAST to SingleStore uses :> operator", () => {
    validateTranspile("SELECT CAST(x AS INT)", {
      read: "bigquery",
      write: "singlestore",
      expected: "SELECT x :> INT",
    });
  });
});

// =============================================================================
// SingleStore: Complex queries
// =============================================================================

describe("SingleStore: complex queries", () => {
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
// SingleStore: Features not yet implemented (marked as todo)
// =============================================================================

describe("SingleStore: features not yet implemented", () => {
  it.todo(":> input parsing (parse `:>` operator back into Cast AST)");
  it.todo("!:> input parsing (parse `!:>` operator back into TryCast AST)");
  it.todo("JSON path operators (::, ::$, ::%, ::?)");
  it.todo("SHOW command variants");
  it.todo("BSON functions (BSON_EXTRACT_BSON, BSON_EXTRACT_STRING, etc.)");
  it.todo("Vector type aliases (I8, I16, I32, I64, F32, F64)");
  it.todo("Oracle-style time format mapping (TO_DATE, TO_TIMESTAMP, TO_CHAR)");
  it.todo("Custom function mappings (35+ functions)");
  it.todo("ALTER TABLE ... CHANGE syntax");
  it.todo("Reserved keywords list (1050+ words)");
  it.todo("RECORD struct delimiter uses parens not angle brackets");
});
