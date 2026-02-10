import { describe, it, expect } from "vitest";
import { parseOne, transpile } from "../../src/index.js";

/**
 * Validate that SQL round-trips through parse -> generate using the MySQL dialect.
 * If writeSql is provided, the generated output is expected to match writeSql.
 * Otherwise, the output should match the input sql exactly.
 */
function validateIdentity(sql: string, writeSql?: string): void {
  const result = transpile(sql, { readDialect: "mysql", writeDialect: "mysql" })[0];
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
    readDialect: opts.read ?? "mysql",
    writeDialect: opts.write ?? "mysql",
  })[0];
  expect(result).toBe(opts.expected);
}

// =============================================================================
// MySQL Identifier Quoting Tests
// =============================================================================

describe("MySQL: identifier quoting with backticks", () => {
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

  it("unquoted table.column", () => {
    validateIdentity("SELECT a.b FROM a");
  });
});

// =============================================================================
// MySQL to default dialect transpilation (backtick -> double-quote)
// =============================================================================

describe("MySQL: transpile MySQL quoted identifiers to default dialect", () => {
  it("backtick identifiers become double-quoted in default dialect", () => {
    validateTranspile("SELECT `a` FROM `b`", {
      read: "mysql",
      write: "",
      expected: 'SELECT "a" FROM "b"',
    });
  });

  it("backtick table.column becomes double-quoted", () => {
    validateTranspile("SELECT `t`.`c` FROM `t`", {
      read: "mysql",
      write: "",
      expected: 'SELECT "t"."c" FROM "t"',
    });
  });

  it("unquoted identifiers pass through to default dialect", () => {
    validateTranspile("SELECT a FROM b", {
      read: "mysql",
      write: "",
      expected: "SELECT a FROM b",
    });
  });
});

// =============================================================================
// Default dialect to MySQL transpilation (double-quote -> backtick)
// =============================================================================

describe("MySQL: transpile default dialect to MySQL", () => {
  it("double-quoted identifiers become backtick-quoted in MySQL", () => {
    validateTranspile('SELECT "a" FROM "b"', {
      read: "",
      write: "mysql",
      expected: "SELECT `a` FROM `b`",
    });
  });

  it("double-quoted table.column becomes backtick-quoted", () => {
    validateTranspile('SELECT "t"."c" FROM "t"', {
      read: "",
      write: "mysql",
      expected: "SELECT `t`.`c` FROM `t`",
    });
  });
});

// =============================================================================
// MySQL SELECT basics
// =============================================================================

describe("MySQL: SELECT basics", () => {
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
// MySQL WHERE clause
// =============================================================================

describe("MySQL: WHERE clause", () => {
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
// MySQL GROUP BY, HAVING, ORDER BY
// =============================================================================

describe("MySQL: GROUP BY, HAVING, ORDER BY", () => {
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
// MySQL JOINs
// =============================================================================

describe("MySQL: JOINs", () => {
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
// MySQL Set Operations
// =============================================================================

describe("MySQL: set operations", () => {
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
// MySQL CTEs
// =============================================================================

describe("MySQL: CTEs", () => {
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
// MySQL CASE WHEN
// =============================================================================

describe("MySQL: CASE WHEN", () => {
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
// MySQL CAST
// =============================================================================

describe("MySQL: CAST", () => {
  it("CAST as INT", () => {
    validateIdentity("SELECT CAST(a AS INT) FROM test");
  });

  it("CAST as DECIMAL", () => {
    validateIdentity("SELECT CAST(a AS DECIMAL(10, 2)) FROM test");
  });

  it("CAST as DATE", () => {
    validateIdentity("SELECT CAST(a AS DATE) FROM test");
  });

  it("CAST as DATETIME", () => {
    validateIdentity("SELECT CAST(a AS DATETIME) FROM test");
  });
});

// =============================================================================
// MySQL Aggregate Functions
// =============================================================================

describe("MySQL: aggregate functions", () => {
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
});

// =============================================================================
// MySQL Functions
// =============================================================================

describe("MySQL: functions", () => {
  it("COALESCE", () => {
    validateIdentity("SELECT COALESCE(a, b, c) FROM test");
  });

  it("NULLIF", () => {
    validateIdentity("SELECT NULLIF(a, b) FROM test");
  });

  it("CONCAT", () => {
    validateIdentity("SELECT CONCAT(a, b) FROM test");
  });

  it("REPLACE", () => {
    validateIdentity("REPLACE('hello world', 'world', 'there')");
  });

  it("UPPER", () => {
    validateIdentity("SELECT UPPER(a) FROM test");
  });

  it("LOWER", () => {
    validateIdentity("SELECT LOWER(a) FROM test");
  });

  it("ABS", () => {
    validateIdentity("SELECT ABS(a) FROM test");
  });

  it("ROUND", () => {
    validateIdentity("SELECT ROUND(a, 2) FROM test");
  });
});

// =============================================================================
// MySQL Window Functions
// =============================================================================

describe("MySQL: window functions", () => {
  it("ROW_NUMBER", () => {
    validateIdentity(
      "SELECT ROW_NUMBER() OVER (ORDER BY a) FROM test",
    );
  });

  it("RANK with PARTITION BY", () => {
    validateIdentity(
      "SELECT RANK() OVER (PARTITION BY a ORDER BY b) FROM test",
    );
  });

  it("SUM window", () => {
    validateIdentity(
      "SELECT SUM(a) OVER (PARTITION BY b) FROM test",
    );
  });
});

// =============================================================================
// MySQL String Handling
// =============================================================================

describe("MySQL: string handling", () => {
  it("single-quoted strings", () => {
    validateIdentity("SELECT 'hello'");
  });

  it("escaped single quote", () => {
    validateIdentity("SELECT ''''");
  });

  it("empty string", () => {
    validateIdentity("SELECT ''");
  });

  it("string with special chars", () => {
    validateIdentity("SELECT 'hello world'");
  });
});

// =============================================================================
// MySQL Subqueries
// =============================================================================

describe("MySQL: subqueries", () => {
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
// MySQL-specific syntax: ILIKE -> LIKE transpilation
// =============================================================================

describe("MySQL: ILIKE not supported (transpile to LIKE)", () => {
  it("ILIKE from default dialect transpiled to LIKE in MySQL", () => {
    const result = transpile("SELECT a FROM t WHERE a ILIKE '%test%'", {
      readDialect: "",
      writeDialect: "mysql",
    })[0];
    expect(result).toBe("SELECT a FROM t WHERE a LIKE '%test%'");
  });
});

// =============================================================================
// MySQL: Backtick quoting for reserved words
// =============================================================================

describe("MySQL: reserved words as identifiers with backticks", () => {
  it("backtick-quoted reserved word as column", () => {
    validateIdentity("SELECT `select` FROM test");
  });

  it("backtick-quoted reserved word as table", () => {
    validateIdentity("SELECT * FROM `order`");
  });

  it("backtick-quoted reserved word as alias", () => {
    validateIdentity("SELECT a AS `table` FROM test");
  });
});

// =============================================================================
// MySQL: Complex queries
// =============================================================================

describe("MySQL: complex queries", () => {
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

  it("CASE in SELECT with backtick-quoted columns", () => {
    validateIdentity(
      "SELECT CASE WHEN `status` = 1 THEN 'active' ELSE 'inactive' END AS `result` FROM `users`",
    );
  });
});

// =============================================================================
// MySQL: NOT BETWEEN, NOT IN, NOT LIKE
// =============================================================================

describe("MySQL: NOT variations", () => {
  it("NOT IN (parser generates NOT x IN form)", () => {
    // The base parser parses "a NOT IN (...)" as NOT(a IN (...))
    // which generates as "NOT a IN (...)"
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
// MySQL: Double-quoted strings as identifiers
// =============================================================================

describe("MySQL: double-quoted strings", () => {
  it("double-quoted strings are parsed as string literals in MySQL tokenizer", () => {
    // MySQL by default treats double-quoted strings as string literals
    // (unless ANSI_QUOTES mode is enabled). However, our tokenizer
    // treats them as identifiers per the IDENTIFIERS config.
    // The MySQL tokenizer uses QUOTES = ["'", '"'] meaning double-quoted
    // strings are parsed as STRING tokens (string literals).
    const result = transpile('SELECT "hello"', {
      readDialect: "mysql",
      writeDialect: "mysql",
    })[0];
    // In MySQL dialect, double-quoted "hello" is tokenized as a string literal
    expect(result).toBe("SELECT 'hello'");
  });
});

// =============================================================================
// MySQL: Transpile between MySQL and default (sqlglot) dialect
// =============================================================================

describe("MySQL: cross-dialect transpilation", () => {
  it("simple SELECT from MySQL to default", () => {
    validateTranspile("SELECT a FROM test", {
      read: "mysql",
      write: "",
      expected: "SELECT a FROM test",
    });
  });

  it("simple SELECT from default to MySQL", () => {
    validateTranspile("SELECT a FROM test", {
      read: "",
      write: "mysql",
      expected: "SELECT a FROM test",
    });
  });

  it("SELECT with backtick identifiers from MySQL to default", () => {
    validateTranspile("SELECT `column_name` FROM `table_name`", {
      read: "mysql",
      write: "",
      expected: 'SELECT "column_name" FROM "table_name"',
    });
  });

  it("SELECT with double-quote identifiers from default to MySQL", () => {
    validateTranspile('SELECT "column_name" FROM "table_name"', {
      read: "",
      write: "mysql",
      expected: "SELECT `column_name` FROM `table_name`",
    });
  });
});

// =============================================================================
// MySQL: Features not yet implemented (marked as todo)
// =============================================================================

describe("MySQL: features not yet implemented", () => {
  it.todo("CREATE TABLE with AUTO_INCREMENT");
  it.todo("CREATE TABLE with ENGINE=InnoDB");
  it.todo("CREATE TABLE with CHARACTER SET");
  it.todo("INSERT INTO ... VALUES");
  it.todo("INSERT INTO ... ON DUPLICATE KEY UPDATE");
  it.todo("UPDATE ... SET");
  it.todo("DELETE FROM ... WHERE");
  it.todo("ALTER TABLE");
  it.todo("DROP TABLE");
  it.todo("SHOW TABLES");
  it.todo("SHOW DATABASES");
  it.todo("SET variable");
  it.todo("LOCK TABLES");
  it.todo("GROUP_CONCAT");
  it.todo("DATE_FORMAT");
  it.todo("STR_TO_DATE");
  it.todo("DATE_ADD with INTERVAL");
  it.todo("DATE_SUB with INTERVAL");
  it.todo("IFNULL");
  it.todo("CHAR function");
  it.todo("MEMBER OF operator");
  it.todo("JSON_EXTRACT with -> and ->> operators");
  it.todo("XOR operator");
  it.todo("DIV integer division");
  it.todo("REGEXP / RLIKE operator");
  it.todo("Index hints (USE INDEX, IGNORE INDEX, FORCE INDEX)");
  it.todo("SELECT ... FOR UPDATE / FOR SHARE");
  it.todo("LIMIT with OFFSET using comma syntax (LIMIT offset, count)");
  it.todo("STRAIGHT_JOIN");
  it.todo("SQL_CALC_FOUND_ROWS");
  it.todo("HIGH_PRIORITY");
  it.todo("PARTITION BY for tables");
  it.todo("CAST to SIGNED / UNSIGNED");
  it.todo("CAST to CHAR (text type mapping)");
  it.todo("VARCHAR -> TEXT / CHAR type mapping");
  it.todo("TIMESTAMP / TIMESTAMPTZ type mapping");
  it.todo("BINARY ORDER BY");
  it.todo("# line comments");
});

// =============================================================================
// MySQL: Verify dialect registration
// =============================================================================

describe("MySQL: dialect registration", () => {
  it("MySQL dialect is registered and can be retrieved", () => {
    // Just verify transpile works with the dialect
    const result = transpile("SELECT 1", {
      readDialect: "mysql",
      writeDialect: "mysql",
    });
    expect(result).toEqual(["SELECT 1"]);
  });

  it("MySQL dialect uses backtick for quoting", () => {
    const result = transpile('SELECT "x"', {
      readDialect: "",
      writeDialect: "mysql",
    });
    expect(result[0]).toBe("SELECT `x`");
  });
});

// =============================================================================
// MySQL: Comment handling
// =============================================================================

describe("MySQL: comment handling", () => {
  it("single line comment with --", () => {
    const result = transpile("SELECT 1 -- comment", {
      readDialect: "mysql",
      writeDialect: "mysql",
    })[0];
    expect(result).toBe("SELECT 1");
  });

  it("block comment /* */", () => {
    const result = transpile("SELECT /* comment */ 1", {
      readDialect: "mysql",
      writeDialect: "mysql",
    })[0];
    expect(result).toBe("SELECT 1");
  });
});

// =============================================================================
// MySQL: NULL and BOOLEAN handling
// =============================================================================

describe("MySQL: NULL and BOOLEAN", () => {
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
// MySQL: EXTRACT
// =============================================================================

describe("MySQL: EXTRACT", () => {
  it.todo(
    "EXTRACT YEAR (base parser expression factory issue with subclassed parsers for Var/Extract)",
  );

  it.todo(
    "EXTRACT MONTH (base parser expression factory issue with subclassed parsers for Var/Extract)",
  );

  it.todo(
    "EXTRACT DAY (base parser expression factory issue with subclassed parsers for Var/Extract)",
  );
});

// =============================================================================
// MySQL: INTERVAL
// =============================================================================

describe("MySQL: INTERVAL", () => {
  it.todo(
    "INTERVAL with string value and unit (base parser expression factory issue with subclassed parsers for Var/Interval)",
  );

  it.todo(
    "INTERVAL YEAR (base parser expression factory issue with subclassed parsers for Var/Interval)",
  );
});
