import { describe, it, expect } from "vitest";
import { parseOne, transpile } from "../src/index.js";

/**
 * Validate that SQL round-trips through parse -> generate.
 * If writeSql is provided, the generated output is expected to match writeSql.
 * Otherwise, the output should match the input sql exactly.
 */
function validateIdentity(sql: string, writeSql?: string): void {
  const result = parseOne(sql).sql();
  expect(result).toBe(writeSql ?? sql);
}

// =============================================================================
// Round-trip identity tests ported from Python sqlglot tests/fixtures/identity.sql
// =============================================================================

describe("transpile identity: literals and basic expressions", () => {
  it("numeric literal 1", () => {
    validateIdentity("1");
  });

  it("parenthesized numeric", () => {
    validateIdentity("(1)");
  });

  it("float literal 1.0", () => {
    validateIdentity("1.0");
  });

  it("parenthesized float", () => {
    validateIdentity("(1.0)");
  });

  it("scientific notation 1E2", () => {
    validateIdentity("1E2");
  });

  it("scientific notation with plus 1E+2", () => {
    validateIdentity("1E+2");
  });

  it("scientific notation with minus 1E-2", () => {
    validateIdentity("1E-2");
  });

  it("arithmetic expression", () => {
    validateIdentity("(1 * 2) / (3 - 5)");
  });

  it("double TRUE in parens", () => {
    validateIdentity("((TRUE))");
  });

  it("empty string", () => {
    validateIdentity("''");
  });

  it("escaped single quote in string", () => {
    validateIdentity("''''");
  });

  it("simple string literal", () => {
    validateIdentity("'x'");
  });

  it("double-quoted identifier", () => {
    validateIdentity('"x"');
  });

  it("modulo", () => {
    validateIdentity("x % 1");
  });

  it("less than", () => {
    validateIdentity("x < 1");
  });

  it("less than or equal", () => {
    validateIdentity("x <= 1");
  });

  it("greater than", () => {
    validateIdentity("x > 1");
  });

  it("greater than or equal", () => {
    validateIdentity("x >= 1");
  });

  it("not equal", () => {
    validateIdentity("x <> 1");
  });

  it("OR expression", () => {
    validateIdentity("x = y OR x > 1");
  });

  it("subtraction with negative", () => {
    validateIdentity("1 - -1");
  });

  it("double negation", () => {
    validateIdentity("- -5");
  });

  it("dotted identifiers: a.b.c", () => {
    validateIdentity("a.b.c");
  });

  it("dotted identifiers: a.b.c.d", () => {
    validateIdentity("a.b.c.d");
  });

  it("dotted identifiers: a.b.c.d.e", () => {
    validateIdentity("a.b.c.d.e");
  });

  it("NOT x IS NULL", () => {
    validateIdentity("NOT x IS NULL");
  });

  it("x IS TRUE", () => {
    validateIdentity("x IS TRUE");
  });

  it("x IS FALSE", () => {
    validateIdentity("x IS FALSE");
  });

  it.todo(
    "x IS TRUE IS TRUE (chained IS not supported by parser)",
  );

  it("x IN with negatives", () => {
    validateIdentity("x IN (-1, 1)");
  });

  it("x IN with strings", () => {
    validateIdentity("x IN ('a', 'a''a')");
  });

  it("x IN with parens", () => {
    validateIdentity("x IN ((1))");
  });

  it("x BETWEEN", () => {
    validateIdentity("x BETWEEN -1 AND 1");
  });

  it("NOT 1", () => {
    validateIdentity("NOT 1");
  });

  it("NOT NOT 1", () => {
    validateIdentity("NOT NOT 1");
  });
});

describe("transpile identity: SELECT basics", () => {
  it("SELECT * FROM test", () => {
    validateIdentity("SELECT * FROM test");
  });

  it("SELECT *, 1 FROM test", () => {
    validateIdentity("SELECT *, 1 FROM test");
  });

  it("SELECT * FROM a.b", () => {
    validateIdentity("SELECT * FROM a.b");
  });

  it("SELECT * FROM a.b.c", () => {
    validateIdentity("SELECT * FROM a.b.c");
  });

  it("SELECT 1", () => {
    validateIdentity("SELECT 1");
  });

  it("SELECT 1 FROM test", () => {
    validateIdentity("SELECT 1 FROM test");
  });

  it("SELECT a FROM test", () => {
    validateIdentity("SELECT a FROM test");
  });

  it("SELECT 1 AS filter", () => {
    validateIdentity("SELECT 1 AS filter");
  });

  it('SELECT 1 AS "quoted alias"', () => {
    validateIdentity('SELECT 1 AS "quoted alias"');
  });

  it("SELECT 1 AS range FROM test", () => {
    validateIdentity("SELECT 1 AS range FROM test");
  });

  it("SELECT 1 AS count FROM test", () => {
    validateIdentity("SELECT 1 AS count FROM test");
  });

  it("SELECT test.* FROM test (qualified star)", () => {
    validateIdentity("SELECT test.* FROM test");
  });

  it("SELECT a AS b FROM test", () => {
    validateIdentity("SELECT a AS b FROM test");
  });

  it('SELECT "a"."b" FROM "a"', () => {
    validateIdentity('SELECT "a"."b" FROM "a"');
  });

  it('SELECT "a".b FROM a', () => {
    validateIdentity('SELECT "a".b FROM a');
  });

  it("SELECT a.b FROM a", () => {
    validateIdentity("SELECT a.b FROM a");
  });

  it("SELECT 1 AS b FROM test", () => {
    validateIdentity("SELECT 1 AS b FROM test");
  });

  it('SELECT 1 AS "b" FROM test', () => {
    validateIdentity('SELECT 1 AS "b" FROM test');
  });

  it("SELECT 1 + 1 FROM test", () => {
    validateIdentity("SELECT 1 + 1 FROM test");
  });

  it("SELECT 1 - 1 FROM test", () => {
    validateIdentity("SELECT 1 - 1 FROM test");
  });

  it("SELECT 1 * 1 FROM test", () => {
    validateIdentity("SELECT 1 * 1 FROM test");
  });

  it("SELECT 1 % 1 FROM test", () => {
    validateIdentity("SELECT 1 % 1 FROM test");
  });

  it("SELECT 1 / 1 FROM test", () => {
    validateIdentity("SELECT 1 / 1 FROM test");
  });

  it("SELECT 1 < 2 FROM test", () => {
    validateIdentity("SELECT 1 < 2 FROM test");
  });

  it("SELECT 1 <= 2 FROM test", () => {
    validateIdentity("SELECT 1 <= 2 FROM test");
  });

  it("SELECT 1 > 2 FROM test", () => {
    validateIdentity("SELECT 1 > 2 FROM test");
  });

  it("SELECT 1 >= 2 FROM test", () => {
    validateIdentity("SELECT 1 >= 2 FROM test");
  });

  it("SELECT 1 <> 2 FROM test", () => {
    validateIdentity("SELECT 1 <> 2 FROM test");
  });

  it("SELECT x LIKE '%x%' FROM test", () => {
    validateIdentity("SELECT x LIKE '%x%' FROM test");
  });

  it("SELECT (1 > 2) AS x FROM test", () => {
    validateIdentity("SELECT (1 > 2) AS x FROM test");
  });

  it("SELECT NOT (1 > 2) FROM test", () => {
    validateIdentity("SELECT NOT (1 > 2) FROM test");
  });

  it("SELECT 1 + 2 AS x FROM test", () => {
    validateIdentity("SELECT 1 + 2 AS x FROM test");
  });

  it("SELECT a, b, 1 < 1 FROM test", () => {
    validateIdentity("SELECT a, b, 1 < 1 FROM test");
  });

  it("SELECT * FROM a, b, (SELECT 1) AS c", () => {
    validateIdentity("SELECT * FROM a, b, (SELECT 1) AS c");
  });
});

describe("transpile identity: more literals and expressions", () => {
  it("-11.023E7 * 3", () => {
    validateIdentity("-11.023E7 * 3");
  });

  it("0.2", () => {
    validateIdentity("0.2");
  });

  it("1.1E10", () => {
    validateIdentity("1.1E10");
  });

  it("1.12e-10", () => {
    validateIdentity("1.12e-10");
  });

  it("x LIKE y", () => {
    validateIdentity("x LIKE y");
  });

  it("MAX(a, b)", () => {
    validateIdentity("MAX(a, b)");
  });

  it("MIN(a, b)", () => {
    validateIdentity("MIN(a, b)");
  });

  it("GREATEST(x)", () => {
    validateIdentity("GREATEST(x)");
  });

  it("LEAST(y)", () => {
    validateIdentity("LEAST(y)");
  });

  it("SELECT * FROM table (reserved word as table name)", () => {
    validateIdentity("SELECT * FROM table");
  });

  it("SELECT GREATEST((3 + 1), LEAST(3, 4))", () => {
    validateIdentity("SELECT GREATEST((3 + 1), LEAST(3, 4))");
  });

  it("SELECT t.count", () => {
    validateIdentity("SELECT t.count");
  });

  it("SELECT SUM(x) AS filter", () => {
    validateIdentity("SELECT SUM(x) AS filter");
  });

  it("SELECT ((SELECT 1) + 1)", () => {
    validateIdentity("SELECT ((SELECT 1) + 1)");
  });

  it("SELECT a AS any, b AS some", () => {
    validateIdentity("SELECT a AS any, b AS some");
  });

  it("SELECT 1 AS a, 2 AS b, 3 AS c FROM t", () => {
    validateIdentity("SELECT 1 AS a, 2 AS b, 3 AS c FROM t");
  });

  it.todo(
    "x BETWEEN 'a' || b AND 'c' || d (|| concat operator not supported in parser)",
  );

  it.todo(
    "SELECT COUNT(a, b) (COUNT with multiple args not supported)",
  );

  it.todo(
    "((SELECT 1) EXCEPT (SELECT 2)) (double-paren set operation not parsed)",
  );
});

describe("transpile identity: SELECT DISTINCT", () => {
  it.todo(
    "SELECT DISTINCT x FROM test (Distinct expression class missing)",
  );

  it.todo(
    "SELECT DISTINCT x, y FROM test (Distinct expression class missing)",
  );
});

describe("transpile identity: WHERE clause", () => {
  it("SELECT a FROM test WHERE NOT FALSE", () => {
    validateIdentity("SELECT a FROM test WHERE NOT FALSE");
  });

  it("SELECT a FROM test WHERE a = 1", () => {
    validateIdentity("SELECT a FROM test WHERE a = 1");
  });

  it("SELECT a FROM test WHERE a = 1 AND b = 2", () => {
    validateIdentity("SELECT a FROM test WHERE a = 1 AND b = 2");
  });

  it("SELECT a FROM test WHERE a IN (SELECT b FROM z)", () => {
    validateIdentity("SELECT a FROM test WHERE a IN (SELECT b FROM z)");
  });

  it("SELECT a FROM test WHERE (a > 1)", () => {
    validateIdentity("SELECT a FROM test WHERE (a > 1)");
  });

  it("SELECT a FROM test WHERE a IN (1, 2, 3) OR b BETWEEN 1 AND 4", () => {
    validateIdentity(
      "SELECT a FROM test WHERE a IN (1, 2, 3) OR b BETWEEN 1 AND 4",
    );
  });

  it.todo(
    "SELECT a FROM test WHERE TRUE OR NOT EXISTS(SELECT * FROM x) (EXISTS adds extra nested parens)",
  );
});

describe("transpile identity: GROUP BY and HAVING", () => {
  it("SELECT a, b FROM test GROUP BY 1", () => {
    validateIdentity("SELECT a, b FROM test GROUP BY 1");
  });

  it("SELECT a, b FROM test GROUP BY a", () => {
    validateIdentity("SELECT a, b FROM test GROUP BY a");
  });

  it("SELECT a, b FROM test WHERE a = 1 GROUP BY a HAVING a = 2", () => {
    validateIdentity(
      "SELECT a, b FROM test WHERE a = 1 GROUP BY a HAVING a = 2",
    );
  });

  it("SELECT a, b FROM test WHERE a = 1 GROUP BY a HAVING a = 2 ORDER BY a", () => {
    validateIdentity(
      "SELECT a, b FROM test WHERE a = 1 GROUP BY a HAVING a = 2 ORDER BY a",
    );
  });

  it("GROUP BY with CASE expression", () => {
    validateIdentity(
      "SELECT a, b FROM test WHERE a = 1 GROUP BY CASE 1 WHEN 1 THEN 1 END",
    );
  });
});

describe("transpile identity: ORDER BY", () => {
  it("SELECT a FROM test ORDER BY a", () => {
    validateIdentity("SELECT a FROM test ORDER BY a");
  });

  it("SELECT a FROM test ORDER BY a, b", () => {
    validateIdentity("SELECT a FROM test ORDER BY a, b");
  });

  it("SELECT x FROM tests ORDER BY a DESC, b DESC, c", () => {
    validateIdentity("SELECT x FROM tests ORDER BY a DESC, b DESC, c");
  });

  it("SELECT a FROM test ORDER BY a > 1", () => {
    validateIdentity("SELECT a FROM test ORDER BY a > 1");
  });
});

describe("transpile identity: LIMIT and OFFSET", () => {
  it.todo(
    "SELECT * FROM test LIMIT 100 (LIMIT consumed as table alias)",
  );

  it.todo(
    "SELECT * FROM test LIMIT 100 OFFSET 200 (LIMIT consumed as table alias)",
  );

  it.todo(
    "SELECT * FROM test LIMIT 1 + 1 (LIMIT consumed as table alias)",
  );
});

describe("transpile identity: CASE WHEN", () => {
  it("simple CASE WHEN", () => {
    validateIdentity(
      "SELECT CASE WHEN a < b THEN 1 WHEN a < c THEN 2 ELSE 3 END FROM test",
    );
  });

  it("CASE with operand", () => {
    validateIdentity("SELECT CASE 1 WHEN 1 THEN 1 ELSE 2 END");
  });

  it("CASE expression + operand", () => {
    validateIdentity("SELECT CASE 1 + 2 WHEN 1 THEN 1 ELSE 2 END");
  });

  it("CASE with paren condition", () => {
    validateIdentity("CASE WHEN (x > 1) THEN 1 ELSE 0 END");
  });

  it("CASE when true then 1 else 0", () => {
    validateIdentity("SELECT CASE WHEN TRUE THEN 1 ELSE 0 END");
  });

  it("nested CASE in CASE operand", () => {
    validateIdentity(
      "SELECT CASE CASE x > 1 WHEN TRUE THEN 1 END WHEN 1 THEN 1 ELSE 2 END",
    );
  });
});

describe("transpile identity: CAST and TRY_CAST", () => {
  it("CAST as INT", () => {
    validateIdentity("SELECT CAST(a AS INT) FROM test");
  });

  it("CAST as VARCHAR", () => {
    validateIdentity("SELECT CAST(a AS VARCHAR) FROM test");
  });

  it("CAST boolean expression as INT", () => {
    validateIdentity("SELECT CAST(a < 1 AS INT) FROM test");
  });

  it("CAST IS NULL as INT", () => {
    validateIdentity("SELECT CAST(a IS NULL AS INT) FROM test");
  });

  it("COUNT with CAST", () => {
    validateIdentity("SELECT COUNT(CAST(1 < 2 AS INT)) FROM test");
  });

  it("CAST as DECIMAL", () => {
    validateIdentity("SELECT CAST(a AS DECIMAL) FROM test");
  });

  it("CAST as DECIMAL(1)", () => {
    validateIdentity("SELECT CAST(a AS DECIMAL(1)) FROM test");
  });

  it("CAST as DECIMAL(1, 2)", () => {
    validateIdentity("SELECT CAST(a AS DECIMAL(1, 2)) FROM test");
  });

  it("CAST as TIMESTAMP", () => {
    validateIdentity("SELECT CAST(a AS TIMESTAMP) FROM test");
  });

  it("CAST as DATE", () => {
    validateIdentity("SELECT CAST(a AS DATE) FROM test");
  });

  it("TRY_CAST as INT", () => {
    validateIdentity("SELECT TRY_CAST(a AS INT) FROM test");
  });

  it("CAST as BOOLEAN", () => {
    validateIdentity(
      "SELECT COUNT(CASE WHEN CAST(1 < 2 AS BOOLEAN) THEN 1 END) FROM test",
    );
  });
});

describe("transpile identity: aggregate functions", () => {
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

  it("COUNT with column", () => {
    validateIdentity("SELECT COUNT(a) FROM test");
  });

  it("COUNT(1)", () => {
    validateIdentity("SELECT COUNT(1) FROM test");
  });

  it("COUNT(*)", () => {
    validateIdentity("SELECT COUNT(*) FROM test");
  });

  it("COUNT(DISTINCT a) FROM test", () => {
    validateIdentity("SELECT COUNT(DISTINCT a) FROM test");
  });

  it("SUM(CASE WHEN ...)", () => {
    validateIdentity("SUM(CASE WHEN x > 1 THEN 1 ELSE 0 END) / y");
  });
});

describe("transpile identity: anonymous / generic functions", () => {
  it("ABS", () => {
    validateIdentity("SELECT ABS(a) FROM test");
  });

  it("CEIL", () => {
    validateIdentity("SELECT CEIL(a) FROM test");
  });

  it("FLOOR", () => {
    validateIdentity("SELECT FLOOR(a) FROM test");
  });

  it("ROUND", () => {
    validateIdentity("SELECT ROUND(a) FROM test");
  });

  it("ROUND with precision", () => {
    validateIdentity("SELECT ROUND(a, 2) FROM test");
  });

  it("COALESCE", () => {
    validateIdentity("SELECT COALESCE(a, b, c) FROM test");
  });

  it("GREATEST", () => {
    validateIdentity("SELECT GREATEST(a, b, c) FROM test");
  });

  it("CONCAT_WS", () => {
    validateIdentity("CONCAT_WS('-', 'a', 'b')");
  });

  it("REPLACE with 3 args", () => {
    validateIdentity("REPLACE('new york', ' ', '_')");
  });

  it("REPLACE with 2 args", () => {
    validateIdentity("REPLACE('new york', ' ')");
  });
});

describe("transpile identity: subqueries", () => {
  it("subquery in FROM", () => {
    validateIdentity("SELECT a FROM (SELECT a FROM test) AS x");
  });

  it("nested subquery in FROM", () => {
    validateIdentity(
      "SELECT a FROM (SELECT a FROM (SELECT a FROM test) AS y) AS x",
    );
  });

  it("subquery in WHERE with comparison", () => {
    validateIdentity(
      "SELECT a FROM test WHERE a > (SELECT 1 FROM x GROUP BY y)",
    );
  });

  it("subquery in IN", () => {
    validateIdentity("SELECT a FROM test WHERE a IN (SELECT b FROM z)");
  });

  it("paren subquery", () => {
    validateIdentity("SELECT * FROM ((SELECT 1))");
  });

  it("subquery with alias", () => {
    validateIdentity("SELECT * FROM (SELECT 1) AS x");
  });

  it("subquery with UNION", () => {
    validateIdentity("SELECT * FROM (SELECT 1 UNION SELECT 2) AS x");
  });

  it("subquery with UNION ALL", () => {
    validateIdentity("SELECT * FROM (SELECT 1 UNION ALL SELECT 2) AS x");
  });

  it("subquery without alias", () => {
    validateIdentity("SELECT * FROM (SELECT 1 UNION ALL SELECT 2)");
  });

  it("subquery aliased to a union alias", () => {
    validateIdentity(
      "SELECT * FROM ((SELECT 1) AS a UNION ALL (SELECT 2) AS b)",
    );
  });

  it("tuple in IN clause with subquery", () => {
    validateIdentity(
      "SELECT a FROM test WHERE (a, b) IN (SELECT 1, 2)",
    );
  });
});

describe("transpile identity: JOINs", () => {
  it("simple JOIN ... ON", () => {
    validateIdentity("SELECT 1 FROM a JOIN b ON a.x = b.x");
  });

  it("JOIN with alias", () => {
    validateIdentity("SELECT 1 FROM a JOIN b AS c ON a.x = b.x");
  });

  it("INNER JOIN", () => {
    validateIdentity("SELECT 1 FROM a INNER JOIN b ON a.x = b.x");
  });

  it.todo(
    "SELECT 1 FROM a LEFT JOIN b ON a.x = b.x (LEFT consumed as table alias)",
  );

  it.todo(
    "SELECT 1 FROM a RIGHT JOIN b ON a.x = b.x (RIGHT consumed as table alias)",
  );

  it("CROSS JOIN", () => {
    validateIdentity("SELECT 1 FROM a CROSS JOIN b ON a.x = b.x");
  });

  it("JOIN ... USING", () => {
    validateIdentity("SELECT 1 FROM a JOIN b USING (x)");
  });

  it("JOIN ... USING multiple columns", () => {
    validateIdentity("SELECT 1 FROM a JOIN b USING (x, y, z)");
  });

  it("JOIN with subquery", () => {
    validateIdentity(
      "SELECT 1 FROM a JOIN (SELECT a FROM c) AS b ON a.x = b.x AND a.x < 2",
    );
  });

  it("multiple JOINs", () => {
    validateIdentity(
      "SELECT 1 FROM a JOIN b ON a.foo = b.bar JOIN c ON a.foo = c.bar",
    );
  });

  it.todo(
    "SELECT 1 FROM a NATURAL JOIN b (NATURAL consumed as table alias)",
  );

  it.todo(
    "SELECT 1 FROM a LEFT OUTER JOIN b ON a.foo = b.bar (LEFT consumed as table alias)",
  );

  it.todo(
    "SELECT 1 FROM a FULL JOIN b ON a.foo = b.bar (FULL consumed as table alias)",
  );
});

describe("transpile identity: set operations (UNION, INTERSECT, EXCEPT)", () => {
  it("UNION", () => {
    validateIdentity("SELECT 1 FROM a UNION SELECT 2 FROM b");
  });

  it("UNION ALL", () => {
    validateIdentity("SELECT 1 FROM a UNION ALL SELECT 2 FROM b");
  });

  it("simple UNION ALL", () => {
    validateIdentity("SELECT 1 UNION ALL SELECT 2");
  });

  it("EXCEPT", () => {
    validateIdentity("SELECT 1 EXCEPT SELECT 2");
  });

  it("INTERSECT", () => {
    validateIdentity("SELECT 1 INTERSECT SELECT 2");
  });

  it("paren UNION", () => {
    validateIdentity("(SELECT 1) UNION (SELECT 2)");
  });

  it.todo(
    "SELECT 1 UNION (SELECT 2) ORDER BY x (ORDER BY after UNION drops ORDER BY)",
  );

  it("nested UNION", () => {
    validateIdentity(
      "(SELECT 1 UNION SELECT 2) UNION (SELECT 2 UNION ALL SELECT 3)",
    );
  });
});

describe("transpile identity: CTEs (WITH clause)", () => {
  it("simple CTE with UNION", () => {
    validateIdentity("WITH a AS (SELECT 1) SELECT 1 UNION ALL SELECT 2");
  });

  it("simple CTE with SELECT", () => {
    validateIdentity("WITH a AS (SELECT 1) SELECT 1 INTERSECT SELECT 2");
  });

  it("simple CTE with EXCEPT", () => {
    validateIdentity("WITH a AS (SELECT 1) SELECT 1 EXCEPT SELECT 2");
  });

  it("WITH a AS (SELECT 1) SELECT a.* FROM a (qualified star in CTE)", () => {
    validateIdentity("WITH a AS (SELECT 1) SELECT a.* FROM a");
  });

  it("multiple CTEs", () => {
    validateIdentity(
      "WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a",
    );
  });

  it("nested CTE in subquery", () => {
    validateIdentity(
      "SELECT * FROM (WITH y AS (SELECT 1 AS z) SELECT z FROM y) AS x",
    );
  });
});

describe("transpile identity: LIKE and ILIKE", () => {
  it("LIKE with pattern", () => {
    validateIdentity("x LIKE '%y%'");
  });

  it("ILIKE with pattern", () => {
    validateIdentity("x ILIKE '%y%'");
  });

  it("LIKE in SELECT", () => {
    validateIdentity("SELECT x LIKE '%x%' FROM test");
  });

  it("x LIKE y", () => {
    validateIdentity("x LIKE y");
  });
});

describe("transpile identity: window functions", () => {
  it("RANK() OVER ()", () => {
    validateIdentity("SELECT RANK() OVER () FROM x");
  });

  it("RANK() OVER () with alias", () => {
    validateIdentity("SELECT RANK() OVER () AS y FROM x");
  });

  it("RANK() OVER (PARTITION BY a)", () => {
    validateIdentity("SELECT RANK() OVER (PARTITION BY a) FROM x");
  });

  it("RANK() OVER (PARTITION BY a, b)", () => {
    validateIdentity("SELECT RANK() OVER (PARTITION BY a, b) FROM x");
  });

  it("RANK() OVER (ORDER BY a)", () => {
    validateIdentity("SELECT RANK() OVER (ORDER BY a) FROM x");
  });

  it("RANK() OVER (ORDER BY a, b)", () => {
    validateIdentity("SELECT RANK() OVER (ORDER BY a, b) FROM x");
  });

  it("RANK() OVER (PARTITION BY a ORDER BY a)", () => {
    validateIdentity(
      "SELECT RANK() OVER (PARTITION BY a ORDER BY a) FROM x",
    );
  });

  it("RANK() OVER (PARTITION BY a, b ORDER BY a, b DESC)", () => {
    validateIdentity(
      "SELECT RANK() OVER (PARTITION BY a, b ORDER BY a, b DESC) FROM x",
    );
  });

  it("SUM(x) OVER with alias", () => {
    validateIdentity("SELECT SUM(x) OVER (PARTITION BY a) AS y FROM x");
  });

  it("SUM(x) OVER with ORDER BY in main query", () => {
    validateIdentity("SELECT SUM(x) OVER (PARTITION BY a) FROM x");
  });
});

describe("transpile identity: EXTRACT", () => {
  it.todo(
    "EXTRACT(DAY FROM y) (Var expression class missing)",
  );

  it.todo(
    "EXTRACT(MONTH FROM y) (Var expression class missing)",
  );
});

describe("transpile identity: INTERVAL", () => {
  it.todo(
    "INTERVAL '1' DAY (Interval expression class missing)",
  );

  it.todo(
    "INTERVAL '1' MONTH (Interval expression class missing)",
  );
});

describe("transpile identity: IN with subquery", () => {
  it("IN subquery", () => {
    validateIdentity("SELECT a FROM test WHERE a IN (SELECT b FROM z)");
  });

  it("IN with values", () => {
    validateIdentity("SELECT a FROM test WHERE a IN (1, 2, 3)");
  });

  it("IN with parenthesized subquery", () => {
    validateIdentity(
      "SELECT a FROM test WHERE a IN ((SELECT 1), 2)",
    );
  });

  it.todo(
    "SELECT * FROM x WHERE y IN ((SELECT 1) UNION (SELECT 2)) (parser limitation with UNION inside IN)",
  );

  it.todo(
    "SELECT * FROM x WHERE y IN (SELECT 1 UNION SELECT 2) (parser limitation with UNION inside IN)",
  );
});

describe("transpile identity: EXISTS", () => {
  // NOTE: The TS implementation wraps EXISTS subquery in extra parens
  it("EXISTS subquery (extra parens in TS impl)", () => {
    validateIdentity(
      "SELECT a FROM test WHERE EXISTS(SELECT 1)",
      "SELECT a FROM test WHERE EXISTS((SELECT 1))",
    );
  });
});

describe("transpile identity: complex SELECT combinations", () => {
  it("SELECT with multiple clauses", () => {
    validateIdentity(
      "SELECT a, b FROM test WHERE a = 1 GROUP BY a HAVING a = 2 ORDER BY a",
    );
  });

  it("nested parenthesized query", () => {
    validateIdentity("SELECT * FROM ((SELECT 1))");
  });

  it("SUM with CASE in denominator", () => {
    validateIdentity("SUM(CASE WHEN x > 1 THEN 1 ELSE 0 END) / y");
  });

  it("multiple FROM tables", () => {
    validateIdentity("SELECT * FROM a, b, (SELECT 1) AS c");
  });

  it("subquery with cross-condition join", () => {
    validateIdentity(
      "SELECT 1 FROM a JOIN (SELECT a FROM c) AS b ON a.x = b.x AND a.x < 2",
    );
  });

  it("nested subquery in FROM", () => {
    validateIdentity(
      "SELECT a FROM (SELECT a FROM (SELECT a FROM test) AS y) AS x",
    );
  });

  it("BETWEEN with OR", () => {
    validateIdentity(
      "SELECT a FROM test WHERE a IN (1, 2, 3) OR b BETWEEN 1 AND 4",
    );
  });
});

describe("transpile identity: special keywords as identifiers", () => {
  it.todo(
    "SELECT 1 AS delete, 2 AS alter (ALTER is not in ID_VAR_TOKENS)",
  );

  it.todo(
    "SELECT x AS INTO FROM bla (INTO is not in ID_VAR_TOKENS)",
  );
});

describe("transpile identity: parenthesized queries with set operations", () => {
  it("(SELECT 1) UNION (SELECT 2)", () => {
    validateIdentity("(SELECT 1) UNION (SELECT 2)");
  });

  it("(SELECT 1) UNION SELECT 2", () => {
    validateIdentity("(SELECT 1) UNION SELECT 2");
  });

  it("SELECT 1 UNION (SELECT 2)", () => {
    validateIdentity("SELECT 1 UNION (SELECT 2)");
  });
});

describe("transpile identity: additional window function patterns", () => {
  it("LAG function", () => {
    validateIdentity("SELECT LAG(x) OVER (ORDER BY y) AS x");
  });

  it("LEAD function", () => {
    validateIdentity("SELECT LEAD(a) OVER (ORDER BY b) AS a");
  });

  it("LEAD with args and PARTITION BY", () => {
    validateIdentity(
      "SELECT LEAD(a, 1) OVER (PARTITION BY a ORDER BY a) AS x",
    );
  });

  it("LEAD with 3 args", () => {
    validateIdentity(
      "SELECT LEAD(a, 1, b) OVER (PARTITION BY a ORDER BY a) AS x",
    );
  });

  it.todo(
    "SUM(x) OVER (w ORDER BY y) (named window reference not supported)",
  );

  it("ROW() OVER () in parens", () => {
    validateIdentity("(ROW() OVER ())");
  });

  it.todo(
    "CASE WHEN SUM(x) > 3 THEN 1 END OVER (PARTITION BY x) (CASE OVER not supported)",
  );

  it("ANY with window function", () => {
    validateIdentity("ANY(x) OVER (PARTITION BY x)");
  });

  it("SUM(ROW() OVER (PARTITION BY x))", () => {
    validateIdentity("SUM(ROW() OVER (PARTITION BY x))");
  });
});

describe("transpile identity: table/column expressions", () => {
  it("SELECT * FROM (x)", () => {
    validateIdentity("SELECT * FROM (x)");
  });

  it("SELECT * FROM ((x))", () => {
    validateIdentity("SELECT * FROM ((x))");
  });

  it("three-part table name", () => {
    validateIdentity("SELECT * FROM a.b.c");
  });

  it("table alias with parens", () => {
    validateIdentity("SELECT * FROM x AS y(a, b)");
  });

  it.todo(
    "SELECT * FROM ((SELECT 1 AS x) CROSS JOIN (SELECT 2 AS y)) AS z (CROSS JOIN inside parens not parsed correctly)",
  );
});

describe("transpile: validate (input -> output) transformations", () => {
  it("spaces around operators", () => {
    const result = transpile("SELECT MIN(3)>MIN(2)")[0];
    expect(result).toBe("SELECT MIN(3) > MIN(2)");
  });

  it("spaces around >=", () => {
    const result = transpile("SELECT MIN(3)>=MIN(2)")[0];
    expect(result).toBe("SELECT MIN(3) >= MIN(2)");
  });

  it("spaces around > for numbers", () => {
    const result = transpile("SELECT 1>0")[0];
    expect(result).toBe("SELECT 1 > 0");
  });

  it("spaces around >= for numbers", () => {
    const result = transpile("SELECT 3>=3")[0];
    expect(result).toBe("SELECT 3 >= 3");
  });

  it("normalizes carriage return/newline", () => {
    const result = transpile("SELECT a\r\nFROM b")[0];
    expect(result).toBe("SELECT a FROM b");
  });

  it("empty string transpiles to empty string", () => {
    expect(transpile("")[0]).toBe("");
  });
});

describe("transpile identity: deeply nested expressions", () => {
  it("nested OR and AND", () => {
    validateIdentity("x = y OR x > 1");
  });

  it("multi-level arithmetic", () => {
    validateIdentity("(1 * 2) / (3 - 5)");
  });

  it("chained joins", () => {
    validateIdentity(
      "SELECT 1 FROM a JOIN b ON a.foo = b.bar JOIN c ON a.foo = c.bar",
    );
  });

  it("nested CASE", () => {
    validateIdentity(
      "SELECT CASE CASE x > 1 WHEN TRUE THEN 1 END WHEN 1 THEN 1 ELSE 2 END",
    );
  });

  it("subquery in subquery", () => {
    validateIdentity(
      "SELECT a FROM (SELECT a FROM (SELECT a FROM test) AS y) AS x",
    );
  });
});

describe("transpile identity: data types in CAST", () => {
  it("CAST as DATETIME", () => {
    validateIdentity("SELECT CAST(a AS DATETIME) FROM test");
  });

  it("CAST as VARCHAR(100)", () => {
    validateIdentity("SELECT CAST(a AS VARCHAR(100)) FROM test");
  });

  it("CAST as BOOLEAN", () => {
    validateIdentity("SELECT CAST(a AS BOOLEAN) FROM test");
  });

  it("CAST as BIGINT", () => {
    validateIdentity("SELECT CAST(a AS BIGINT) FROM test");
  });

  it("CAST as SMALLINT", () => {
    validateIdentity("SELECT CAST(a AS SMALLINT) FROM test");
  });

  it("CAST as TINYINT", () => {
    validateIdentity("SELECT CAST(a AS TINYINT) FROM test");
  });

  it("CAST as FLOAT", () => {
    validateIdentity("SELECT CAST(a AS FLOAT) FROM test");
  });

  it("CAST as DOUBLE", () => {
    validateIdentity("SELECT CAST(a AS DOUBLE) FROM test");
  });

  it("CAST as TEXT", () => {
    validateIdentity("SELECT CAST(a AS TEXT) FROM test");
  });
});

describe("transpile identity: CREATE, INSERT, UPDATE, DELETE (unsupported)", () => {
  it.todo("CREATE TABLE z (a INT, b VARCHAR) (parser does not support DDL)");
  it.todo("INSERT INTO x VALUES (1, 'a', 2.0) (parser does not support DML)");
  it.todo("UPDATE tbl_name SET foo = 123 (parser does not support DML)");
  it.todo("DELETE FROM x WHERE y > 1 (parser does not support DML)");
  it.todo("DROP TABLE a (parser does not support DDL)");
});

describe("transpile identity: more SELECT patterns from identity.sql", () => {
  it("SELECT COALESCE(a, b)", () => {
    validateIdentity("SELECT COALESCE(a, b)");
  });

  it("SELECT a.b.c.d.e", () => {
    validateIdentity("SELECT a.b.c.d.e");
  });

  it("SELECT a.b FROM a.b", () => {
    validateIdentity("SELECT * FROM a.b");
  });

  it("SELECT a.b.c FROM a.b.c", () => {
    validateIdentity("SELECT * FROM a.b.c");
  });

  it('SELECT \'\"hi\' AS x FROM x', () => {
    validateIdentity("SELECT '\"hi' AS x FROM x");
  });

  it("SELECT a FROM test WHERE a = 1 AND b = 2 deep nesting", () => {
    validateIdentity(
      "SELECT a FROM test WHERE a = 1 AND b = 2",
    );
  });

  it("SELECT with subquery in WHERE comparison", () => {
    validateIdentity(
      "SELECT a FROM test WHERE a > (SELECT 1 FROM x GROUP BY y)",
    );
  });

  it("COUNT with CASE and CAST", () => {
    validateIdentity(
      "SELECT COUNT(CASE WHEN CAST(1 < 2 AS BOOLEAN) THEN 1 END) FROM test",
    );
  });

  it("SELECT with multiple JOINs chained", () => {
    validateIdentity(
      "SELECT 1 FROM a JOIN b ON a.foo = b.bar JOIN c ON a.foo = c.bar",
    );
  });

  it("INNER JOIN with table alias", () => {
    validateIdentity("SELECT 1 FROM a INNER JOIN b ON a.x = b.x");
  });

  it("JOIN with USING multiple columns", () => {
    validateIdentity("SELECT 1 FROM a JOIN b USING (x, y, z)");
  });

  it("JOIN with subquery table and complex ON", () => {
    validateIdentity(
      "SELECT 1 FROM a JOIN (SELECT a FROM c) AS b ON a.x = b.x AND a.x < 2",
    );
  });

  it("SELECT with table keyword as name", () => {
    validateIdentity("SELECT * FROM table");
  });
});

describe("transpile identity: additional set operation patterns", () => {
  it("CTE with UNION", () => {
    validateIdentity("WITH a AS (SELECT 1) SELECT 1 UNION SELECT 2");
  });

  it("nested unions", () => {
    validateIdentity(
      "(SELECT 1 UNION SELECT 2) UNION (SELECT 2 UNION ALL SELECT 3)",
    );
  });

  it("subquery with set op in FROM", () => {
    validateIdentity(
      "SELECT * FROM (SELECT 1 UNION SELECT 2) AS x",
    );
  });

  it("aliased paren subquery in set ops", () => {
    validateIdentity(
      "SELECT * FROM ((SELECT 1) AS a UNION ALL (SELECT 2) AS b)",
    );
  });
});

describe("transpile identity: complex CAST type expressions", () => {
  it("CAST as CHAR", () => {
    validateIdentity("SELECT CAST(a AS CHAR) FROM test");
  });

  it("CAST as BINARY", () => {
    validateIdentity("SELECT CAST(a AS BINARY) FROM test");
  });
});

describe("transpile identity: advanced syntax (unsupported)", () => {
  it.todo("LATERAL VIEW EXPLODE (not supported)");
  it.todo("CROSS JOIN UNNEST (not supported)");
  it.todo("PIVOT / UNPIVOT (not supported)");
  it.todo("TABLESAMPLE (not supported)");
  it.todo("QUALIFY (not supported)");
  it.todo("GROUPING SETS (not supported)");
  it.todo("CUBE / ROLLUP (not supported)");
  it.todo("WINDOW with ROWS/RANGE frames (not supported)");
  it.todo("VALUES clause (not supported)");
  it.todo("SELECT * EXCEPT / REPLACE (not supported)");
  it.todo("JSON_OBJECT (not supported)");
  it.todo("PRAGMA (not supported)");
  it.todo("SET / USE / COMMIT / ROLLBACK (not supported)");
  it.todo("GRANT / REVOKE (not supported)");
  it.todo("ALTER TABLE (not supported)");
  it.todo("CREATE VIEW / CREATE FUNCTION (not supported)");
  it.todo("RECURSIVE CTE (not supported)");
  it.todo("FETCH FIRST N ROWS (not supported)");
});

// =============================================================================
// Kitchen Sink: complex queries combining many SQL features
// =============================================================================

describe("transpile: kitchen sink queries", () => {
  it("kitchen sink analytics: CTEs, window functions, CASE, aggregates, subquery", () => {
    const sql = `WITH monthly_orders AS (SELECT user_id, DATE_TRUNC('month', created_at) AS month, COUNT(*) AS order_count, SUM(total) AS monthly_total, AVG(total) AS avg_order FROM orders WHERE status IN ('completed', 'pending') GROUP BY user_id, DATE_TRUNC('month', created_at) HAVING SUM(total) > 50), user_stats AS (SELECT u.id, u.name, COALESCE(u.email, 'no email') AS email, COUNT(o.id) AS lifetime_orders, COALESCE(SUM(o.total), 0) AS lifetime_spent, MIN(o.created_at) AS first_order, MAX(o.created_at) AS last_order, SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS completed, SUM(CASE WHEN o.status = 'cancelled' THEN o.total ELSE 0 END) AS lost_revenue FROM users AS u LEFT JOIN orders AS o ON u.id = o.user_id GROUP BY u.id, u.name, u.email), ranked AS (SELECT us.*, RANK() OVER (ORDER BY us.lifetime_spent DESC) AS spend_rank, NTILE(3) OVER (ORDER BY us.lifetime_spent DESC) AS spend_tier FROM user_stats AS us WHERE us.lifetime_orders > 0) SELECT r.name, r.email, r.lifetime_orders, r.lifetime_spent, r.completed, r.lost_revenue, r.spend_rank, CASE r.spend_tier WHEN 1 THEN 'Top' WHEN 2 THEN 'Mid' ELSE 'Low' END AS tier, (SELECT ROUND(AVG(mo.monthly_total), 2) FROM monthly_orders AS mo WHERE mo.user_id = r.id) AS avg_monthly_spend, r.first_order, r.last_order, r.last_order - r.first_order AS customer_tenure FROM ranked AS r ORDER BY r.spend_rank, r.name LIMIT 20`;
    const result = parseOne(sql).sql();
    expect(result).toContain("monthly_orders");
    expect(result).toContain("user_stats");
    expect(result).toContain("ranked");
    expect(result).toContain("RANK()");
    expect(result).toContain("NTILE(3)");
    expect(result).toContain("COALESCE");
    expect(result).toContain("us.*");
    expect(result).toContain("CASE");
    expect(result).toContain("LIMIT 20");
  });

  it("kitchen sink cross-dialect: MySQL → Postgres", () => {
    const sql =
      "WITH `order_summary` AS (" +
      "SELECT `o`.`user_id`, COUNT(*) AS `cnt`, SUM(`o`.`total`) AS `sum_total`, " +
      "MIN(`o`.`total`) AS `min_order`, MAX(`o`.`total`) AS `max_order`, " +
      "COUNT(DISTINCT `o`.`status`) AS `status_count` " +
      "FROM `orders` AS `o` " +
      "WHERE `o`.`created_at` >= '2024-01-01' AND `o`.`status` <> 'cancelled' " +
      "GROUP BY `o`.`user_id` HAVING SUM(`o`.`total`) > 100" +
      "), " +
      "`ranked_users` AS (" +
      "SELECT `u`.`id`, `u`.`name`, COALESCE(`u`.`email`, 'N/A') AS `email`, " +
      "`os`.`cnt`, `os`.`sum_total`, `os`.`min_order`, `os`.`max_order`, `os`.`status_count`, " +
      "ROW_NUMBER() OVER (ORDER BY `os`.`sum_total` DESC) AS `rn`, " +
      "SUM(`os`.`sum_total`) OVER () AS `grand_total`, " +
      "ROUND(`os`.`sum_total` * 100.0 / SUM(`os`.`sum_total`) OVER (), 2) AS `pct_of_total`, " +
      "LAG(`os`.`sum_total`) OVER (ORDER BY `os`.`sum_total` DESC) AS `prev_total`, " +
      "LEAD(`os`.`sum_total`) OVER (ORDER BY `os`.`sum_total` DESC) AS `next_total` " +
      "FROM `users` AS `u` " +
      "INNER JOIN `order_summary` AS `os` ON `u`.`id` = `os`.`user_id` " +
      "WHERE EXISTS (SELECT 1 FROM `orders` AS `o2` WHERE `o2`.`user_id` = `u`.`id` AND `o2`.`status` = 'completed')" +
      ") " +
      "SELECT `rn` AS `rank`, `name`, `email`, `cnt` AS `orders`, " +
      "`sum_total` AS `total_spent`, `min_order`, `max_order`, `status_count`, " +
      "CASE WHEN `sum_total` > 500 THEN 'VIP' WHEN `sum_total` > 200 THEN 'Regular' ELSE 'Starter' END AS `tier`, " +
      "`pct_of_total`, COALESCE(`sum_total` - `prev_total`, 0) AS `gap_from_above`, `grand_total` " +
      "FROM `ranked_users` ORDER BY `rn` LIMIT 50";
    const result = transpile(sql, { readDialect: "mysql", writeDialect: "postgres" });
    expect(result.length).toBe(1);
    const out = result[0];
    // Backticks should become double-quotes
    expect(out).not.toContain("`");
    expect(out).toContain('"order_summary"');
    expect(out).toContain('"ranked_users"');
    // Window functions preserved
    expect(out).toContain("ROW_NUMBER()");
    expect(out).toContain("LAG(");
    expect(out).toContain("LEAD(");
    expect(out).toContain("OVER");
    // Aggregates and keywords
    expect(out).toContain("EXISTS");
    expect(out).toContain("INNER JOIN");
    expect(out).toContain("COALESCE");
    expect(out).toContain("CASE");
    expect(out).toContain("LIMIT 50");
  });

  it("qualified star: SELECT t.* FROM t", () => {
    validateIdentity("SELECT t.* FROM t");
  });

  it("qualified star with extra columns", () => {
    validateIdentity("SELECT t.*, t.id, 1 AS x FROM t");
  });

  it("qualified star in CTE with window function", () => {
    const sql =
      "WITH stats AS (SELECT 1 AS x, 2 AS y) " +
      "SELECT stats.*, RANK() OVER (ORDER BY stats.x DESC) AS rk FROM stats";
    const result = parseOne(sql).sql();
    expect(result).toContain("stats.*");
    expect(result).toContain("RANK()");
  });
});

// =============================================================================
// Date/time function transpilation tests
// =============================================================================

describe("transpile: date/time functions", () => {
  it("CURRENT_DATE round-trips (no parens)", () => {
    validateIdentity("SELECT CURRENT_DATE");
  });

  it("CURRENT_TIMESTAMP round-trips (no parens)", () => {
    validateIdentity("SELECT CURRENT_TIMESTAMP");
  });

  it("CURRENT_TIME round-trips (no parens)", () => {
    validateIdentity("SELECT CURRENT_TIME");
  });

  it("CURRENT_DATE() with parens generates without parens", () => {
    // CURRENT_DATE() is equivalent to CURRENT_DATE — generated without parens
    const result = transpile("SELECT CURRENT_DATE()");
    expect(result[0]).toBe("SELECT CURRENT_DATE");
  });

  it("CURRENT_TIMESTAMP() with parens generates without parens", () => {
    const result = transpile("SELECT CURRENT_TIMESTAMP()");
    expect(result[0]).toBe("SELECT CURRENT_TIMESTAMP");
  });

  it("NOW() transpiles to CURRENT_TIMESTAMP", () => {
    const result = transpile("SELECT NOW()");
    expect(result[0]).toBe("SELECT CURRENT_TIMESTAMP");
  });

  it("CURDATE() transpiles to CURRENT_DATE", () => {
    const result = transpile("SELECT CURDATE()");
    expect(result[0]).toBe("SELECT CURRENT_DATE");
  });

  it("CURTIME() transpiles to CURRENT_TIME", () => {
    const result = transpile("SELECT CURTIME()");
    expect(result[0]).toBe("SELECT CURRENT_TIME");
  });

  it("MySQL CURDATE() → Postgres CURRENT_DATE", () => {
    const result = transpile("SELECT CURDATE()", {
      readDialect: "mysql",
      writeDialect: "postgres",
    });
    expect(result[0]).toBe("SELECT CURRENT_DATE");
  });

  it("MySQL NOW() → Postgres CURRENT_TIMESTAMP", () => {
    const result = transpile("SELECT NOW()", {
      readDialect: "mysql",
      writeDialect: "postgres",
    });
    expect(result[0]).toBe("SELECT CURRENT_TIMESTAMP");
  });

  it("Postgres NOW() → MySQL CURRENT_TIMESTAMP", () => {
    const result = transpile("SELECT NOW()", {
      readDialect: "postgres",
      writeDialect: "mysql",
    });
    expect(result[0]).toBe("SELECT CURRENT_TIMESTAMP");
  });

  it("MySQL CURRENT_DATE → Postgres CURRENT_DATE", () => {
    const result = transpile("SELECT CURRENT_DATE", {
      readDialect: "mysql",
      writeDialect: "postgres",
    });
    expect(result[0]).toBe("SELECT CURRENT_DATE");
  });

  it("CURRENT_DATE in WHERE clause", () => {
    validateIdentity(
      "SELECT * FROM orders WHERE created_at >= CURRENT_DATE"
    );
  });

  it("CURRENT_TIMESTAMP in SELECT with alias", () => {
    validateIdentity("SELECT CURRENT_TIMESTAMP AS now_ts");
  });

  it("NOW() in complex query transpiles correctly", () => {
    const result = transpile(
      "SELECT `id`, `name` FROM `users` WHERE `created_at` < NOW()",
      { readDialect: "mysql", writeDialect: "postgres" },
    );
    expect(result[0]).toBe(
      'SELECT "id", "name" FROM "users" WHERE "created_at" < CURRENT_TIMESTAMP'
    );
  });
});
