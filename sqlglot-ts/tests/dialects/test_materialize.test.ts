import { describe, it, expect } from "vitest";
import { transpile, Dialect } from "../../src/index.js";
import "../../src/dialects/materialize.js";

/**
 * Validate that SQL round-trips through parse -> generate using the Materialize dialect.
 * If writeSql is provided, the generated output is expected to match writeSql.
 * Otherwise, the output should match the input sql exactly.
 */
function validateIdentity(sql: string, writeSql?: string): void {
  const result = transpile(sql, {
    readDialect: "materialize",
    writeDialect: "materialize",
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
    readDialect: opts.read ?? "materialize",
    writeDialect: opts.write ?? "materialize",
  })[0];
  expect(result).toBe(opts.expected);
}

// =============================================================================
// Materialize dialect registration
// =============================================================================

describe("Materialize: dialect registration", () => {
  it("registers under 'materialize'", () => {
    const d = Dialect.getOrRaise("materialize");
    expect(d).toBeDefined();
    expect(d.constructor.name).toBe("Materialize");
  });
});

// =============================================================================
// Materialize identifier quoting
// =============================================================================

describe("Materialize: identifier quoting", () => {
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

  it("uses double-quote for identifiers", () => {
    const d = Dialect.getOrRaise("materialize");
    expect(d.IDENTIFIER_START).toBe('"');
    expect(d.IDENTIFIER_END).toBe('"');
  });
});

// =============================================================================
// Materialize string quoting
// =============================================================================

describe("Materialize: string quoting", () => {
  it("single-quoted string literal", () => {
    validateIdentity("SELECT 'hello'");
  });

  it("escaped single quote in string", () => {
    validateIdentity("SELECT 'it''s'");
  });

  it("empty string", () => {
    validateIdentity("SELECT ''");
  });

  it("uses single-quote for strings", () => {
    const d = Dialect.getOrRaise("materialize");
    expect(d.QUOTE_START).toBe("'");
    expect(d.QUOTE_END).toBe("'");
  });
});

// =============================================================================
// Materialize cross-dialect transpilation
// =============================================================================

describe("Materialize: cross-dialect transpilation", () => {
  it("from default dialect to materialize", () => {
    validateTranspile("SELECT 1", {
      read: "",
      write: "materialize",
      expected: "SELECT 1",
    });
  });

  it("from materialize to default dialect", () => {
    validateTranspile("SELECT 1", {
      read: "materialize",
      write: "",
      expected: "SELECT 1",
    });
  });

  it("MySQL backticks become double-quotes in Materialize", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "mysql",
      write: "materialize",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("Materialize double-quotes become backticks in MySQL", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "materialize",
      write: "mysql",
      expected: "SELECT `col` FROM `tbl`",
    });
  });

  it("Postgres double-quotes stay in Materialize", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "postgres",
      write: "materialize",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("Materialize double-quotes stay in Postgres", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "materialize",
      write: "postgres",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("BigQuery backticks become double-quotes in Materialize", () => {
    validateTranspile("SELECT `col` FROM `tbl`", {
      read: "bigquery",
      write: "materialize",
      expected: 'SELECT "col" FROM "tbl"',
    });
  });

  it("Materialize double-quotes become backticks in BigQuery", () => {
    validateTranspile('SELECT "col" FROM "tbl"', {
      read: "materialize",
      write: "bigquery",
      expected: "SELECT `col` FROM `tbl`",
    });
  });
});

// =============================================================================
// Materialize SELECT basics
// =============================================================================

describe("Materialize: SELECT basics", () => {
  it("SELECT 1", () => {
    validateIdentity("SELECT 1");
  });

  it("SELECT * FROM t", () => {
    validateIdentity("SELECT * FROM t");
  });

  it("SELECT a, b, c FROM t", () => {
    validateIdentity("SELECT a, b, c FROM t");
  });

  it("SELECT with alias", () => {
    validateIdentity("SELECT a AS b FROM t");
  });

  it("SELECT with string literal", () => {
    validateIdentity("SELECT 'hello'");
  });

  it("SELECT with number", () => {
    validateIdentity("SELECT 42");
  });

  it("SELECT with arithmetic", () => {
    validateIdentity("SELECT 1 + 2 * 3");
  });

  it("SELECT with expression alias", () => {
    validateIdentity("SELECT a + b AS total FROM t");
  });

  it("SELECT with comparison", () => {
    validateIdentity("SELECT a > 1 FROM t");
  });

  it("three-part table name", () => {
    validateIdentity("SELECT * FROM a.b.c");
  });

  it.todo("LIMIT/OFFSET (parser currently consumes LIMIT as table alias)");
});

// =============================================================================
// Materialize WHERE clause
// =============================================================================

describe("Materialize: WHERE clause", () => {
  it("simple WHERE", () => {
    validateIdentity("SELECT a FROM t WHERE a = 1");
  });

  it("WHERE with AND", () => {
    validateIdentity("SELECT a FROM t WHERE a = 1 AND b = 2");
  });

  it("WHERE with OR", () => {
    validateIdentity("SELECT a FROM t WHERE a = 1 OR b = 2");
  });

  it("WHERE with IN", () => {
    validateIdentity("SELECT a FROM t WHERE a IN (1, 2, 3)");
  });

  it("WHERE with BETWEEN", () => {
    validateIdentity("SELECT a FROM t WHERE a BETWEEN 1 AND 10");
  });

  it("WHERE with LIKE", () => {
    validateIdentity("SELECT a FROM t WHERE a LIKE '%test%'");
  });

  it("WHERE with IS NULL", () => {
    validateIdentity("SELECT a FROM t WHERE a IS NULL");
  });

  it("WHERE with NOT", () => {
    validateIdentity("SELECT a FROM t WHERE NOT a = 1");
  });

  it("WHERE with subquery IN", () => {
    validateIdentity("SELECT a FROM t WHERE a IN (SELECT b FROM other)");
  });

  it("complex WHERE with AND/OR", () => {
    validateIdentity(
      "SELECT a FROM t WHERE a IN (1, 2, 3) OR b BETWEEN 1 AND 4",
    );
  });
});

// =============================================================================
// Materialize GROUP BY, HAVING, ORDER BY
// =============================================================================

describe("Materialize: GROUP BY, HAVING, ORDER BY", () => {
  it("GROUP BY", () => {
    validateIdentity("SELECT a, COUNT(*) FROM t GROUP BY a");
  });

  it("GROUP BY with HAVING", () => {
    validateIdentity(
      "SELECT a, COUNT(*) FROM t GROUP BY a HAVING COUNT(*) > 1",
    );
  });

  it("ORDER BY", () => {
    validateIdentity("SELECT a FROM t ORDER BY a");
  });

  it("ORDER BY DESC", () => {
    validateIdentity("SELECT a FROM t ORDER BY a DESC");
  });

  it("ORDER BY multiple", () => {
    validateIdentity("SELECT a, b FROM t ORDER BY a, b DESC");
  });

  it("ORDER BY NULLS FIRST", () => {
    validateIdentity("SELECT a FROM t ORDER BY a NULLS FIRST");
  });

  it("ORDER BY NULLS LAST", () => {
    validateIdentity("SELECT a FROM t ORDER BY a NULLS LAST");
  });

  it("GROUP BY, HAVING, ORDER BY combined", () => {
    validateIdentity(
      "SELECT a, b FROM t WHERE a = 1 GROUP BY a HAVING a = 2 ORDER BY a",
    );
  });
});

// =============================================================================
// Materialize JOINs
// =============================================================================

describe("Materialize: JOINs", () => {
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

  it("JOIN ... USING multiple columns", () => {
    validateIdentity("SELECT 1 FROM a JOIN b USING (x, y, z)");
  });

  it("multiple JOINs", () => {
    validateIdentity(
      "SELECT 1 FROM a JOIN b ON a.x = b.x JOIN c ON b.y = c.y",
    );
  });

  it("JOIN with subquery", () => {
    validateIdentity(
      "SELECT 1 FROM a JOIN (SELECT a FROM c) AS b ON a.x = b.x",
    );
  });

  it("comma join", () => {
    validateIdentity("SELECT * FROM a, b");
  });
});

// =============================================================================
// Materialize set operations
// =============================================================================

describe("Materialize: set operations", () => {
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
// Materialize CTEs
// =============================================================================

describe("Materialize: CTEs", () => {
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
// Materialize CASE WHEN
// =============================================================================

describe("Materialize: CASE WHEN", () => {
  it("simple CASE WHEN", () => {
    validateIdentity(
      "SELECT CASE WHEN a > 1 THEN 'yes' ELSE 'no' END FROM t",
    );
  });

  it("CASE with operand", () => {
    validateIdentity(
      "SELECT CASE a WHEN 1 THEN 'one' WHEN 2 THEN 'two' ELSE 'other' END",
    );
  });

  it("CASE with multiple WHEN", () => {
    validateIdentity(
      "SELECT CASE WHEN a < b THEN 1 WHEN a < c THEN 2 ELSE 3 END FROM t",
    );
  });

  it("CASE with paren condition", () => {
    validateIdentity("CASE WHEN (x > 1) THEN 1 ELSE 0 END");
  });
});

// =============================================================================
// Materialize CAST type mappings
// =============================================================================

describe("Materialize: CAST type mappings", () => {
  it("TINYINT -> SMALLINT", () => {
    validateTranspile("SELECT CAST(x AS TINYINT)", {
      write: "materialize",
      expected: "SELECT CAST(x AS SMALLINT)",
    });
  });

  it("FLOAT -> REAL", () => {
    validateTranspile("SELECT CAST(x AS FLOAT)", {
      write: "materialize",
      expected: "SELECT CAST(x AS REAL)",
    });
  });

  it("DOUBLE -> DOUBLE PRECISION", () => {
    validateTranspile("SELECT CAST(x AS DOUBLE)", {
      write: "materialize",
      expected: "SELECT CAST(x AS DOUBLE PRECISION)",
    });
  });

  it("BINARY -> BYTEA", () => {
    validateTranspile("SELECT CAST(x AS BINARY)", {
      write: "materialize",
      expected: "SELECT CAST(x AS BYTEA)",
    });
  });

  it("VARBINARY -> BYTEA", () => {
    validateTranspile("SELECT CAST(x AS VARBINARY)", {
      write: "materialize",
      expected: "SELECT CAST(x AS BYTEA)",
    });
  });

  it("BLOB -> BYTEA", () => {
    validateTranspile("SELECT CAST(x AS BLOB)", {
      write: "materialize",
      expected: "SELECT CAST(x AS BYTEA)",
    });
  });

  it("DATETIME -> TIMESTAMP", () => {
    validateTranspile("SELECT CAST(x AS DATETIME)", {
      write: "materialize",
      expected: "SELECT CAST(x AS TIMESTAMP)",
    });
  });

  it("INT stays INT", () => {
    validateTranspile("SELECT CAST(x AS INT)", {
      write: "materialize",
      expected: "SELECT CAST(x AS INT)",
    });
  });

  it("BIGINT stays BIGINT", () => {
    validateTranspile("SELECT CAST(x AS BIGINT)", {
      write: "materialize",
      expected: "SELECT CAST(x AS BIGINT)",
    });
  });

  it("SMALLINT stays SMALLINT", () => {
    validateTranspile("SELECT CAST(x AS SMALLINT)", {
      write: "materialize",
      expected: "SELECT CAST(x AS SMALLINT)",
    });
  });

  it("VARCHAR stays VARCHAR", () => {
    validateTranspile("SELECT CAST(x AS VARCHAR)", {
      write: "materialize",
      expected: "SELECT CAST(x AS VARCHAR)",
    });
  });

  it("CHAR stays CHAR", () => {
    validateTranspile("SELECT CAST(x AS CHAR)", {
      write: "materialize",
      expected: "SELECT CAST(x AS CHAR)",
    });
  });

  it("TEXT stays TEXT", () => {
    validateTranspile("SELECT CAST(x AS TEXT)", {
      write: "materialize",
      expected: "SELECT CAST(x AS TEXT)",
    });
  });

  it("BOOLEAN stays BOOLEAN", () => {
    validateTranspile("SELECT CAST(x AS BOOLEAN)", {
      write: "materialize",
      expected: "SELECT CAST(x AS BOOLEAN)",
    });
  });

  it("DATE stays DATE", () => {
    validateTranspile("SELECT CAST(x AS DATE)", {
      write: "materialize",
      expected: "SELECT CAST(x AS DATE)",
    });
  });

  it("TIMESTAMP stays TIMESTAMP", () => {
    validateTranspile("SELECT CAST(x AS TIMESTAMP)", {
      write: "materialize",
      expected: "SELECT CAST(x AS TIMESTAMP)",
    });
  });

  it("DECIMAL stays DECIMAL", () => {
    validateTranspile("SELECT CAST(x AS DECIMAL)", {
      write: "materialize",
      expected: "SELECT CAST(x AS DECIMAL)",
    });
  });

  it("VARCHAR with length preserved", () => {
    validateTranspile("SELECT CAST(a AS VARCHAR(256))", {
      write: "materialize",
      expected: "SELECT CAST(a AS VARCHAR(256))",
    });
  });

  it("DECIMAL with precision preserved", () => {
    validateTranspile("SELECT CAST(a AS DECIMAL(18, 2))", {
      write: "materialize",
      expected: "SELECT CAST(a AS DECIMAL(18, 2))",
    });
  });
});

// =============================================================================
// Materialize ILIKE support (native)
// =============================================================================

describe("Materialize: ILIKE support", () => {
  it("ILIKE round-trips natively", () => {
    validateIdentity("SELECT * FROM t WHERE name ILIKE '%foo%'");
  });

  it("NOT ILIKE", () => {
    validateIdentity("SELECT * FROM t WHERE NOT name ILIKE '%foo%'");
  });

  it("LIKE still works", () => {
    validateIdentity("SELECT * FROM t WHERE name LIKE '%foo%'");
  });

  it("ILIKE from Materialize to MySQL becomes LIKE", () => {
    validateTranspile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      read: "materialize",
      write: "mysql",
      expected: "SELECT a FROM t WHERE a LIKE '%test%'",
    });
  });

  it("ILIKE from Postgres to Materialize preserves ILIKE", () => {
    validateTranspile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      read: "postgres",
      write: "materialize",
      expected: "SELECT a FROM t WHERE a ILIKE '%test%'",
    });
  });
});

// =============================================================================
// Materialize aggregate functions
// =============================================================================

describe("Materialize: aggregate functions", () => {
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

  it("NULLIF", () => {
    validateIdentity("SELECT NULLIF(a, b) FROM t");
  });
});

// =============================================================================
// Materialize window functions
// =============================================================================

describe("Materialize: window functions", () => {
  it("ROW_NUMBER", () => {
    validateIdentity("SELECT ROW_NUMBER() OVER (ORDER BY a) FROM t");
  });

  it("RANK with PARTITION BY", () => {
    validateIdentity(
      "SELECT RANK() OVER (PARTITION BY a ORDER BY b) FROM t",
    );
  });

  it("RANK() OVER ()", () => {
    validateIdentity("SELECT RANK() OVER () FROM t");
  });

  it("SUM window", () => {
    validateIdentity("SELECT SUM(a) OVER (PARTITION BY b) FROM t");
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

// =============================================================================
// Materialize subqueries
// =============================================================================

describe("Materialize: subqueries", () => {
  it("subquery in FROM", () => {
    validateIdentity("SELECT a FROM (SELECT a FROM t) AS x");
  });

  it("subquery in WHERE", () => {
    validateIdentity(
      "SELECT a FROM t WHERE a > (SELECT MAX(b) FROM other)",
    );
  });

  it("subquery in IN", () => {
    validateIdentity("SELECT a FROM t WHERE a IN (SELECT b FROM other)");
  });

  it("nested subquery", () => {
    validateIdentity(
      "SELECT a FROM (SELECT a FROM (SELECT a FROM t) AS y) AS x",
    );
  });
});

// =============================================================================
// Materialize literals
// =============================================================================

describe("Materialize: literals", () => {
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

// =============================================================================
// Materialize NOT variations
// =============================================================================

describe("Materialize: NOT variations", () => {
  it("NOT IN (parser generates NOT x IN form)", () => {
    validateIdentity(
      "SELECT a FROM t WHERE a NOT IN (1, 2, 3)",
      "SELECT a FROM t WHERE NOT a IN (1, 2, 3)",
    );
  });

  it("NOT BETWEEN (parser generates NOT x BETWEEN form)", () => {
    validateIdentity(
      "SELECT a FROM t WHERE a NOT BETWEEN 1 AND 10",
      "SELECT a FROM t WHERE NOT a BETWEEN 1 AND 10",
    );
  });

  it("NOT LIKE (parser generates NOT x LIKE form)", () => {
    validateIdentity(
      "SELECT a FROM t WHERE a NOT LIKE '%test%'",
      "SELECT a FROM t WHERE NOT a LIKE '%test%'",
    );
  });
});

// =============================================================================
// Materialize comment handling
// =============================================================================

describe("Materialize: comments", () => {
  it("single line comment with --", () => {
    const result = transpile("SELECT 1 -- comment", {
      readDialect: "materialize",
      writeDialect: "materialize",
    })[0];
    expect(result).toBe("SELECT 1");
  });

  it("block comment /* */", () => {
    const result = transpile("SELECT /* comment */ 1", {
      readDialect: "materialize",
      writeDialect: "materialize",
    })[0];
    expect(result).toBe("SELECT 1");
  });
});

// =============================================================================
// Materialize NULL and BOOLEAN handling
// =============================================================================

describe("Materialize: NULL and BOOLEAN", () => {
  it("NULL literal", () => {
    validateIdentity("SELECT NULL");
  });

  it("TRUE literal", () => {
    validateIdentity("SELECT TRUE");
  });

  it("FALSE literal", () => {
    validateIdentity("SELECT FALSE");
  });

  it("SELECT NULL, TRUE, FALSE", () => {
    validateIdentity("SELECT NULL, TRUE, FALSE");
  });

  it("IS NULL", () => {
    validateIdentity("SELECT a IS NULL FROM t");
  });

  it("IS NOT NULL (generates NOT a IS NULL)", () => {
    validateIdentity("SELECT a FROM t WHERE NOT a IS NULL");
  });

  it("IS TRUE", () => {
    validateIdentity("SELECT a IS TRUE FROM t");
  });

  it("IS FALSE", () => {
    validateIdentity("SELECT a IS FALSE FROM t");
  });
});

// =============================================================================
// Materialize cross-dialect type transpilation
// =============================================================================

describe("Materialize: cross-dialect type transpilation", () => {
  it("CAST types from default to Materialize get mapped", () => {
    validateTranspile("SELECT CAST(x AS DOUBLE)", {
      read: "",
      write: "materialize",
      expected: "SELECT CAST(x AS DOUBLE PRECISION)",
    });
  });

  it("Materialize CAST as INT transpiles to Postgres INT", () => {
    validateTranspile("SELECT CAST(x AS INT)", {
      read: "materialize",
      write: "postgres",
      expected: "SELECT CAST(x AS INT)",
    });
  });

  it("Materialize TINYINT transpiles to Postgres SMALLINT", () => {
    validateTranspile("SELECT CAST(x AS TINYINT)", {
      read: "materialize",
      write: "postgres",
      expected: "SELECT CAST(x AS SMALLINT)",
    });
  });

  it("Materialize DOUBLE transpiles to Postgres DOUBLE PRECISION", () => {
    validateTranspile("SELECT CAST(x AS DOUBLE)", {
      read: "materialize",
      write: "postgres",
      expected: "SELECT CAST(x AS DOUBLE PRECISION)",
    });
  });
});

// =============================================================================
// Materialize arithmetic
// =============================================================================

describe("Materialize: arithmetic", () => {
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
// Materialize complex queries
// =============================================================================

describe("Materialize: complex queries", () => {
  it("complex SELECT with WHERE, GROUP BY, HAVING, ORDER BY", () => {
    validateIdentity(
      "SELECT a, COUNT(*) FROM t WHERE b > 1 GROUP BY a HAVING COUNT(*) > 2 ORDER BY a",
    );
  });

  it("nested subquery", () => {
    validateIdentity(
      "SELECT a FROM (SELECT a FROM (SELECT a FROM t) AS t1) AS t2",
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
// Materialize: features not yet implemented (marked as todo)
// =============================================================================

describe("Materialize: features not yet implemented", () => {
  it.todo(":: cast operator syntax (e.g., x::INT)");
  it.todo("SOURCES, SINKS, VIEWS, MATERIALIZED VIEWS statements");
  it.todo("CREATE SOURCE / CREATE SINK");
  it.todo("CREATE MATERIALIZED VIEW");
  it.todo("MAP data type (MAP[key_type => value_type])");
  it.todo("LIST data type");
  it.todo("MAP[] and LIST[] literal syntax");
  it.todo("=> (fat arrow) operator in MAP literals");
  it.todo("Temporal filters (AS OF)");
  it.todo("SUBSCRIBE statement");
  it.todo("CREATE TABLE / ALTER TABLE / DROP TABLE");
  it.todo("INSERT / UPDATE / DELETE statements");
  it.todo("|| string concatenation operator");
  it.todo("JSON operators (->>, ->, #>, #>>)");
  it.todo("Window functions with ROWS/RANGE frames");
  it.todo("LATERAL joins");
  it.todo("EXPLAIN");
  it.todo("Dollar-quoted strings ($$text$$)");
  it.todo("LIMIT/OFFSET (parser currently consumes LIMIT as table alias)");
  it.todo("Postgres-specific regex operators (~ and ~*)");
  it.todo("INTERVAL with Postgres-specific formatting");
});
