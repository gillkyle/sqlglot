import { describe, it, expect } from "vitest";
import { parseOne, transpile, Dialect } from "../../src/index.js";

/**
 * Validate that SQL round-trips through parse -> generate using the Postgres dialect.
 * If writeSql is provided, the generated output is expected to match writeSql.
 * Otherwise, the output should match the input sql exactly.
 */
function validateIdentity(sql: string, writeSql?: string): void {
  const result = transpile(sql, {
    readDialect: "postgres",
    writeDialect: "postgres",
  })[0];
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
    readDialect: opts.read ?? "postgres",
    writeDialect: opts.write ?? "postgres",
  })[0];
  expect(result).toBe(opts.expected);
}

// =============================================================================
// Postgres dialect registration
// =============================================================================

describe("Postgres dialect registration", () => {
  it("registers under 'postgres'", () => {
    const d = Dialect.getOrRaise("postgres");
    expect(d).toBeDefined();
    expect(d.constructor.name).toBe("Postgres");
  });

  it("registers under 'postgresql'", () => {
    const d = Dialect.getOrRaise("postgresql");
    expect(d).toBeDefined();
    expect(d.constructor.name).toBe("Postgres");
  });

  it("uses double-quote for identifiers", () => {
    const d = Dialect.getOrRaise("postgres");
    expect(d.IDENTIFIER_START).toBe('"');
    expect(d.IDENTIFIER_END).toBe('"');
  });
});

// =============================================================================
// Postgres identity round-trip tests
// =============================================================================

describe("Postgres identity: basic SELECT", () => {
  it("SELECT 1", () => {
    validateIdentity("SELECT 1");
  });

  it("SELECT * FROM t", () => {
    validateIdentity("SELECT * FROM t");
  });

  it("SELECT a, b FROM t", () => {
    validateIdentity("SELECT a, b FROM t");
  });

  it("SELECT a FROM t WHERE x = 1", () => {
    validateIdentity("SELECT a FROM t WHERE x = 1");
  });

  it("SELECT a FROM t WHERE x = 1 AND y = 2", () => {
    validateIdentity("SELECT a FROM t WHERE x = 1 AND y = 2");
  });

  it("SELECT a AS b FROM t", () => {
    validateIdentity("SELECT a AS b FROM t");
  });

  it("SELECT 1 AS filter", () => {
    validateIdentity("SELECT 1 AS filter");
  });

  it("quoted identifier", () => {
    validateIdentity('SELECT "a" FROM "b"');
  });

  it("mixed quoted and unquoted", () => {
    validateIdentity('SELECT "a".b FROM a');
  });

  it("three-part table name", () => {
    validateIdentity("SELECT * FROM a.b.c");
  });

  it("SELECT NULL, TRUE, FALSE", () => {
    validateIdentity("SELECT NULL, TRUE, FALSE");
  });
});

describe("Postgres identity: WHERE clause", () => {
  it("IN clause", () => {
    validateIdentity("SELECT a FROM t WHERE a IN (1, 2, 3)");
  });

  it("BETWEEN", () => {
    validateIdentity("SELECT a FROM t WHERE a BETWEEN 1 AND 10");
  });

  it("IS NULL", () => {
    validateIdentity("SELECT a FROM t WHERE a IS NULL");
  });

  it("IS NOT NULL", () => {
    validateIdentity("SELECT a FROM t WHERE NOT a IS NULL");
  });

  it("NOT IN", () => {
    validateIdentity("SELECT a FROM t WHERE NOT a IN (1, 2)");
  });

  it("complex WHERE with AND/OR", () => {
    validateIdentity(
      "SELECT a FROM t WHERE a IN (1, 2, 3) OR b BETWEEN 1 AND 4",
    );
  });
});

describe("Postgres identity: ILIKE support", () => {
  it("ILIKE with pattern", () => {
    validateIdentity("SELECT * FROM t WHERE name ILIKE '%foo%'");
  });

  it("NOT ILIKE", () => {
    validateIdentity("SELECT * FROM t WHERE NOT name ILIKE '%foo%'");
  });

  it("LIKE still works", () => {
    validateIdentity("SELECT * FROM t WHERE name LIKE '%foo%'");
  });
});

describe("Postgres identity: aggregate functions", () => {
  it("COUNT(*)", () => {
    validateIdentity("SELECT COUNT(*) FROM t");
  });

  it("COUNT(a)", () => {
    validateIdentity("SELECT COUNT(a) FROM t");
  });

  it("SUM", () => {
    validateIdentity("SELECT SUM(a) FROM t");
  });

  it("AVG", () => {
    validateIdentity("SELECT AVG(a) FROM t");
  });

  it("MIN", () => {
    validateIdentity("SELECT MIN(a) FROM t");
  });

  it("MAX", () => {
    validateIdentity("SELECT MAX(a) FROM t");
  });

  it("COALESCE", () => {
    validateIdentity("SELECT COALESCE(a, b, c) FROM t");
  });
});

describe("Postgres identity: CAST", () => {
  it("CAST as INT", () => {
    validateIdentity("SELECT CAST(a AS INT) FROM t");
  });

  it("CAST as VARCHAR", () => {
    validateIdentity("SELECT CAST(a AS VARCHAR) FROM t");
  });

  it("CAST as VARCHAR(100)", () => {
    validateIdentity("SELECT CAST(a AS VARCHAR(100)) FROM t");
  });

  it("CAST as DECIMAL(10, 2)", () => {
    validateIdentity("SELECT CAST(a AS DECIMAL(10, 2)) FROM t");
  });

  it("CAST as BOOLEAN", () => {
    validateIdentity("SELECT CAST(a AS BOOLEAN) FROM t");
  });

  it("CAST as TEXT", () => {
    validateIdentity("SELECT CAST(a AS TEXT) FROM t");
  });

  it("CAST as TIMESTAMP", () => {
    validateIdentity("SELECT CAST(a AS TIMESTAMP) FROM t");
  });

  it("CAST as DATE", () => {
    validateIdentity("SELECT CAST(a AS DATE) FROM t");
  });

  it("CAST as BIGINT", () => {
    validateIdentity("SELECT CAST(a AS BIGINT) FROM t");
  });

  it("CAST as SMALLINT", () => {
    validateIdentity("SELECT CAST(a AS SMALLINT) FROM t");
  });
});

describe("Postgres type mappings", () => {
  it("TINYINT -> SMALLINT", () => {
    validateTranspile("SELECT CAST(x AS TINYINT)", {
      write: "postgres",
      expected: "SELECT CAST(x AS SMALLINT)",
    });
  });

  it("FLOAT -> REAL", () => {
    validateTranspile("SELECT CAST(x AS FLOAT)", {
      write: "postgres",
      expected: "SELECT CAST(x AS REAL)",
    });
  });

  it("DOUBLE -> DOUBLE PRECISION", () => {
    validateTranspile("SELECT CAST(x AS DOUBLE)", {
      write: "postgres",
      expected: "SELECT CAST(x AS DOUBLE PRECISION)",
    });
  });

  it("BINARY -> BYTEA", () => {
    validateTranspile("SELECT CAST(x AS BINARY)", {
      write: "postgres",
      expected: "SELECT CAST(x AS BYTEA)",
    });
  });

  it("VARBINARY -> BYTEA", () => {
    validateTranspile("SELECT CAST(x AS VARBINARY)", {
      write: "postgres",
      expected: "SELECT CAST(x AS BYTEA)",
    });
  });

  it("DATETIME -> TIMESTAMP", () => {
    validateTranspile("SELECT CAST(x AS DATETIME)", {
      write: "postgres",
      expected: "SELECT CAST(x AS TIMESTAMP)",
    });
  });

  it("INT stays INT", () => {
    validateTranspile("SELECT CAST(x AS INT)", {
      write: "postgres",
      expected: "SELECT CAST(x AS INT)",
    });
  });

  it("VARCHAR stays VARCHAR", () => {
    validateTranspile("SELECT CAST(x AS VARCHAR)", {
      write: "postgres",
      expected: "SELECT CAST(x AS VARCHAR)",
    });
  });

  it("TEXT stays TEXT", () => {
    validateTranspile("SELECT CAST(x AS TEXT)", {
      write: "postgres",
      expected: "SELECT CAST(x AS TEXT)",
    });
  });

  it("BOOLEAN stays BOOLEAN", () => {
    validateTranspile("SELECT CAST(x AS BOOLEAN)", {
      write: "postgres",
      expected: "SELECT CAST(x AS BOOLEAN)",
    });
  });
});

describe("Postgres identity: JOINs", () => {
  it("JOIN ON", () => {
    validateIdentity("SELECT 1 FROM a JOIN b ON a.x = b.x");
  });

  it("INNER JOIN", () => {
    validateIdentity("SELECT 1 FROM a INNER JOIN b ON a.x = b.x");
  });

  it("CROSS JOIN", () => {
    validateIdentity("SELECT 1 FROM a CROSS JOIN b ON a.x = b.x");
  });

  it("JOIN USING", () => {
    validateIdentity("SELECT 1 FROM a JOIN b USING (x)");
  });

  it("JOIN USING multiple columns", () => {
    validateIdentity("SELECT 1 FROM a JOIN b USING (x, y, z)");
  });

  it("multiple JOINs", () => {
    validateIdentity(
      "SELECT 1 FROM a JOIN b ON a.foo = b.bar JOIN c ON a.foo = c.bar",
    );
  });

  it("JOIN with subquery", () => {
    validateIdentity(
      "SELECT 1 FROM a JOIN (SELECT a FROM c) AS b ON a.x = b.x",
    );
  });
});

describe("Postgres identity: subqueries", () => {
  it("subquery in FROM", () => {
    validateIdentity("SELECT a FROM (SELECT a FROM t) AS x");
  });

  it("subquery in WHERE", () => {
    validateIdentity("SELECT a FROM t WHERE a IN (SELECT b FROM z)");
  });

  it("nested subquery", () => {
    validateIdentity(
      "SELECT a FROM (SELECT a FROM (SELECT a FROM t) AS y) AS x",
    );
  });
});

describe("Postgres identity: set operations", () => {
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

describe("Postgres identity: CTEs", () => {
  it("simple CTE", () => {
    validateIdentity("WITH a AS (SELECT 1) SELECT * FROM a");
  });

  it("multiple CTEs", () => {
    validateIdentity(
      "WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a",
    );
  });

  it("CTE with UNION", () => {
    validateIdentity("WITH a AS (SELECT 1) SELECT 1 UNION ALL SELECT 2");
  });
});

describe("Postgres identity: GROUP BY and HAVING", () => {
  it("GROUP BY", () => {
    validateIdentity("SELECT a, b FROM t GROUP BY a");
  });

  it("GROUP BY with HAVING", () => {
    validateIdentity(
      "SELECT a, b FROM t WHERE a = 1 GROUP BY a HAVING a = 2",
    );
  });

  it("GROUP BY, HAVING, ORDER BY", () => {
    validateIdentity(
      "SELECT a, b FROM t WHERE a = 1 GROUP BY a HAVING a = 2 ORDER BY a",
    );
  });
});

describe("Postgres identity: ORDER BY", () => {
  it("simple ORDER BY", () => {
    validateIdentity("SELECT a FROM t ORDER BY a");
  });

  it("ORDER BY DESC", () => {
    validateIdentity("SELECT x FROM t ORDER BY a DESC, b DESC, c");
  });

  it("ORDER BY NULLS FIRST", () => {
    validateIdentity("SELECT a FROM t ORDER BY a NULLS FIRST");
  });

  it("ORDER BY NULLS LAST", () => {
    validateIdentity("SELECT a FROM t ORDER BY a NULLS LAST");
  });

  it("ORDER BY DESC NULLS FIRST", () => {
    validateIdentity("SELECT a FROM t ORDER BY a DESC NULLS FIRST");
  });
});

describe("Postgres identity: CASE WHEN", () => {
  it("simple CASE WHEN", () => {
    validateIdentity(
      "SELECT CASE WHEN a < b THEN 1 WHEN a < c THEN 2 ELSE 3 END FROM t",
    );
  });

  it("CASE with operand", () => {
    validateIdentity("SELECT CASE 1 WHEN 1 THEN 1 ELSE 2 END");
  });

  it("CASE with paren condition", () => {
    validateIdentity("CASE WHEN (x > 1) THEN 1 ELSE 0 END");
  });
});

describe("Postgres identity: window functions", () => {
  it("RANK() OVER ()", () => {
    validateIdentity("SELECT RANK() OVER () FROM t");
  });

  it("RANK() OVER (PARTITION BY a)", () => {
    validateIdentity("SELECT RANK() OVER (PARTITION BY a) FROM t");
  });

  it("RANK() OVER (ORDER BY a)", () => {
    validateIdentity("SELECT RANK() OVER (ORDER BY a) FROM t");
  });

  it("SUM(x) OVER (PARTITION BY a) AS y", () => {
    validateIdentity("SELECT SUM(x) OVER (PARTITION BY a) AS y FROM t");
  });

  it("ROW_NUMBER() OVER (PARTITION BY a ORDER BY b)", () => {
    validateIdentity(
      "SELECT ROW_NUMBER() OVER (PARTITION BY a ORDER BY b) FROM t",
    );
  });
});

describe("Postgres identity: string and numeric literals", () => {
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

  it("scientific notation", () => {
    validateIdentity("SELECT 1E10");
  });

  it("negative number", () => {
    validateIdentity("SELECT -1");
  });

  it("empty string", () => {
    validateIdentity("SELECT ''");
  });
});

describe("Postgres identity: arithmetic", () => {
  it("addition", () => {
    validateIdentity("SELECT a + b FROM t");
  });

  it("subtraction", () => {
    validateIdentity("SELECT a - b FROM t");
  });

  it("multiplication", () => {
    validateIdentity("SELECT a * b FROM t");
  });

  it("division", () => {
    validateIdentity("SELECT a / b FROM t");
  });

  it("modulo", () => {
    validateIdentity("SELECT a % b FROM t");
  });

  it("complex expression", () => {
    validateIdentity("SELECT (a + b) * (c - d) / e FROM t");
  });
});

// =============================================================================
// Cross-dialect transpilation tests
// =============================================================================

describe("Postgres transpilation: from base to postgres", () => {
  it("basic SELECT transpiles identically", () => {
    validateTranspile("SELECT 1", {
      read: "",
      write: "postgres",
      expected: "SELECT 1",
    });
  });

  it("SELECT with WHERE", () => {
    validateTranspile("SELECT a FROM t WHERE x > 1", {
      read: "",
      write: "postgres",
      expected: "SELECT a FROM t WHERE x > 1",
    });
  });

  it("CAST types get mapped", () => {
    validateTranspile("SELECT CAST(x AS DOUBLE)", {
      read: "",
      write: "postgres",
      expected: "SELECT CAST(x AS DOUBLE PRECISION)",
    });
  });
});

describe("Postgres transpilation: from postgres to base", () => {
  it("basic SELECT transpiles identically", () => {
    validateTranspile("SELECT 1", {
      read: "postgres",
      write: "",
      expected: "SELECT 1",
    });
  });

  it("ILIKE preserved in base output", () => {
    validateTranspile("SELECT * FROM t WHERE x ILIKE '%a%'", {
      read: "postgres",
      write: "",
      expected: "SELECT * FROM t WHERE x ILIKE '%a%'",
    });
  });
});

describe("Postgres transpilation: from postgres to mysql", () => {
  it("basic SELECT", () => {
    validateTranspile("SELECT 1", {
      read: "postgres",
      write: "mysql",
      expected: "SELECT 1",
    });
  });

  it("ILIKE becomes LIKE in MySQL", () => {
    validateTranspile("SELECT * FROM t WHERE x ILIKE '%a%'", {
      read: "postgres",
      write: "mysql",
      expected: "SELECT * FROM t WHERE x LIKE '%a%'",
    });
  });

  it("quoted identifiers differ", () => {
    // Postgres uses double quotes, MySQL uses backticks
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "postgres",
      write: "mysql",
      expected: "SELECT `col` FROM `tbl`",
    });
  });
});

describe("Postgres transpilation: from mysql to postgres", () => {
  it("backtick identifiers become double-quoted", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "mysql",
      write: "postgres",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });
});

// =============================================================================
// Features not yet implemented (marked as todo)
// =============================================================================

describe("Postgres: features not yet implemented", () => {
  it.todo(":: cast operator syntax (e.g., x::INT)");
  it.todo("SERIAL / BIGSERIAL / SMALLSERIAL data types in CREATE TABLE");
  it.todo("NOW() -> CURRENT_TIMESTAMP transpilation");
  it.todo("ARRAY[1, 2, 3] literal syntax");
  it.todo("JSON operators (->>, ->, #>, #>>)");
  it.todo("String concatenation with || operator");
  it.todo("DISTINCT ON (expr) syntax");
  it.todo("RETURNING clause");
  it.todo("CREATE TABLE / ALTER TABLE / DROP TABLE");
  it.todo("INSERT / UPDATE / DELETE statements");
  it.todo("INTERVAL with Postgres-specific formatting");
  it.todo("GENERATE_SERIES function");
  it.todo("LATERAL joins");
  it.todo("UNNEST");
  it.todo("EXPLAIN");
  it.todo("COPY command");
  it.todo("Dollar-quoted strings ($$text$$)");
  it.todo("E'escape' byte strings");
  it.todo("Postgres-specific regex operators (~ and ~*)");
  it.todo("TYPE casting with :: in complex expressions");
  it.todo("TABLESAMPLE");
  it.todo("EXCLUSION constraints");
  it.todo("SIMILAR TO operator");
  it.todo("PostgreSQL-specific type casts: BYTEA, MONEY, etc.");
  it.todo("TRY_CAST -> generates error (Postgres has no TRY_CAST)");
  it.todo("Window functions with ROWS/RANGE frames");
  it.todo("LIMIT/OFFSET (parser currently consumes LIMIT as table alias)");
});
