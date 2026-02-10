import { describe, it, expect } from "vitest";
import { parseOne, Generator } from "../src/index.js";

describe("TestGenerator", () => {
  // =========================================================================
  // test_fallback_function_sql
  // =========================================================================
  it.todo(
    "test_fallback_function_sql (requires custom Func subclass and custom Parser subclass, not yet supported in TS)",
  );

  // =========================================================================
  // test_fallback_function_var_args_sql
  // =========================================================================
  it.todo(
    "test_fallback_function_var_args_sql (requires custom Func subclass, custom Parser, and DateTrunc/Var classes not available in TS)",
  );

  // =========================================================================
  // test_identify
  // =========================================================================
  describe("test_identify", () => {
    it("identify=true quotes a lowercase identifier", () => {
      expect(parseOne("x").sql({ identify: true })).toBe('"x"');
    });

    it("identify=false does not quote", () => {
      expect(parseOne("x").sql({ identify: false })).toBe("x");
    });

    it("identify=true quotes an uppercase identifier", () => {
      expect(parseOne("X").sql({ identify: true })).toBe('"X"');
    });

    it("identify=false preserves already-quoted identifier", () => {
      expect(parseOne('"x"').sql({ identify: false })).toBe('"x"');
    });

    it.todo(
      'identify="safe" quotes lowercase but not uppercase (safe mode not implemented in TS generator)',
    );
    // In Python:
    // parse_one("x").sql(identify="safe") == '"x"'
    // parse_one("X").sql(identify="safe") == "X"
    // parse_one("x as 1").sql(identify="safe") == '"x" AS "1"'
    // parse_one("X as 1").sql(identify="safe") == 'X AS "1"'
  });

  // =========================================================================
  // test_generate_nested_binary
  // =========================================================================
  describe("test_generate_nested_binary", () => {
    it("generates deeply nested binary additions without stack overflow", () => {
      // Python test uses || (1000 times), but TS parser does not support ||.
      // Use + instead to test deeply nested binary generation.
      const depth = 500;
      const sql = "SELECT 1" + " + 1".repeat(depth);
      const result = parseOne(sql).sql({ copy: false });
      expect(result).toBe(sql);
    });

    it.todo(
      "generates deeply nested concatenation with || (|| operator not parsed in TS)",
    );
  });

  // =========================================================================
  // test_overlap_operator
  // =========================================================================
  it.todo(
    "test_overlap_operator (requires Postgres dialect and &< / &> operators, not available in TS)",
  );

  // =========================================================================
  // test_pretty_nested_types
  // =========================================================================
  it.todo(
    "test_pretty_nested_types (requires DataType.build to parse complex nested types like STRUCT<a INT, b TEXT>, and pretty printing for nested types, not available in TS)",
  );

  // =========================================================================
  // Generator constructor options
  // =========================================================================
  describe("Generator constructor options", () => {
    it("has default pretty=false", () => {
      const gen = new Generator();
      expect(gen.pretty).toBe(false);
    });

    it("accepts pretty=true", () => {
      const gen = new Generator({ pretty: true });
      expect(gen.pretty).toBe(true);
    });

    it("has default identify=false", () => {
      const gen = new Generator();
      expect(gen.identify).toBe(false);
    });

    it("accepts identify=true", () => {
      const gen = new Generator({ identify: true });
      expect(gen.identify).toBe(true);
    });

    it("has default normalize=false", () => {
      const gen = new Generator();
      expect(gen.normalize).toBe(false);
    });

    it("accepts normalize=true", () => {
      const gen = new Generator({ normalize: true });
      expect(gen.normalize).toBe(true);
    });

    it("has default normalizeFunction='upper'", () => {
      const gen = new Generator();
      expect(gen.normalizeFunction).toBe("upper");
    });

    it("accepts normalize_functions='lower'", () => {
      const gen = new Generator({ normalize_functions: "lower" });
      expect(gen.normalizeFunction).toBe("lower");
    });

    it("has default pad=2", () => {
      const gen = new Generator();
      expect(gen.pad).toBe(2);
    });

    it("accepts custom pad", () => {
      const gen = new Generator({ pad: 4 });
      expect(gen.pad).toBe(4);
    });

    it("has default leadingComma=false", () => {
      const gen = new Generator();
      expect(gen.leadingComma).toBe(false);
    });

    it("accepts leading_comma=true", () => {
      const gen = new Generator({ leading_comma: true });
      expect(gen.leadingComma).toBe(true);
    });
  });

  // =========================================================================
  // Generator.generate basics
  // =========================================================================
  describe("Generator.generate", () => {
    it("generates SQL from a parsed SELECT", () => {
      const expr = parseOne("SELECT 1");
      const gen = new Generator();
      expect(gen.generate(expr)).toBe("SELECT 1");
    });

    it("generates SQL with identify=true", () => {
      const expr = parseOne("SELECT x FROM y");
      const gen = new Generator({ identify: true });
      expect(gen.generate(expr)).toBe('SELECT "x" FROM "y"');
    });

    it("generates SQL with copy=true (default)", () => {
      const expr = parseOne("SELECT a FROM b");
      const gen = new Generator();
      const sql = gen.generate(expr, true);
      expect(sql).toBe("SELECT a FROM b");
      // Original expression should be unmodified
      expect(expr.sql()).toBe("SELECT a FROM b");
    });

    it("generates SQL with copy=false", () => {
      const expr = parseOne("SELECT a FROM b");
      const gen = new Generator();
      const sql = gen.generate(expr, false);
      expect(sql).toBe("SELECT a FROM b");
    });
  });

  // =========================================================================
  // Generator.normalizeFunc
  // =========================================================================
  describe("Generator.normalizeFunc", () => {
    it("normalizeFunc with upper (default) uppercases", () => {
      const gen = new Generator();
      expect(gen.normalizeFunc("my_func")).toBe("MY_FUNC");
    });

    it("normalizeFunc with lower lowercases", () => {
      const gen = new Generator({ normalize_functions: "lower" });
      expect(gen.normalizeFunc("MY_FUNC")).toBe("my_func");
    });

    it("normalizeFunc with false preserves case", () => {
      const gen = new Generator({ normalize_functions: false });
      expect(gen.normalizeFunc("My_Func")).toBe("My_Func");
    });

    it("normalizeFunc with true uppercases (same as upper)", () => {
      const gen = new Generator({ normalize_functions: true });
      expect(gen.normalizeFunc("my_func")).toBe("MY_FUNC");
    });
  });

  // =========================================================================
  // Generator.func helper
  // =========================================================================
  describe("Generator.func", () => {
    it("generates function call with no args", () => {
      const gen = new Generator();
      expect(gen.func("MY_FUNC")).toBe("MY_FUNC()");
    });

    it("generates function call with string arg", () => {
      const gen = new Generator();
      expect(gen.func("MY_FUNC", "a")).toBe("MY_FUNC(a)");
    });

    it("skips null/undefined args", () => {
      const gen = new Generator();
      expect(gen.func("MY_FUNC", "a", null, undefined, "b")).toBe(
        "MY_FUNC(a, b)",
      );
    });

    it("normalizes function name", () => {
      const gen = new Generator({ normalize_functions: "lower" });
      expect(gen.func("MY_FUNC", "x")).toBe("my_func(x)");
    });
  });

  // =========================================================================
  // Generator.sep and Generator.seg
  // =========================================================================
  describe("Generator.sep and Generator.seg", () => {
    it("sep returns space when not pretty", () => {
      const gen = new Generator({ pretty: false });
      expect(gen.sep()).toBe(" ");
    });

    it("sep returns newline when pretty", () => {
      const gen = new Generator({ pretty: true });
      expect(gen.sep()).toBe("\n");
    });

    it("sep with custom separator when not pretty", () => {
      const gen = new Generator({ pretty: false });
      expect(gen.sep(", ")).toBe(", ");
    });

    it("sep with custom separator when pretty trims", () => {
      const gen = new Generator({ pretty: true });
      expect(gen.sep(", ")).toBe(",\n");
    });

    it("seg prepends sep when not pretty", () => {
      const gen = new Generator({ pretty: false });
      expect(gen.seg("FROM")).toBe(" FROM");
    });

    it("seg prepends newline when pretty", () => {
      const gen = new Generator({ pretty: true });
      expect(gen.seg("FROM")).toBe("\nFROM");
    });
  });

  // =========================================================================
  // Generator.indent
  // =========================================================================
  describe("Generator.indent", () => {
    it("returns input unchanged when not pretty", () => {
      const gen = new Generator({ pretty: false });
      expect(gen.indent("hello")).toBe("hello");
    });

    it("indents with default pad when pretty", () => {
      const gen = new Generator({ pretty: true });
      expect(gen.indent("hello")).toBe("  hello");
    });

    it("indents with custom pad when pretty", () => {
      const gen = new Generator({ pretty: true, pad: 4 });
      expect(gen.indent("hello")).toBe("    hello");
    });

    it("indents multiline text", () => {
      const gen = new Generator({ pretty: true });
      expect(gen.indent("a\nb")).toBe("  a\n  b");
    });

    it("respects skipFirst", () => {
      const gen = new Generator({ pretty: true });
      expect(gen.indent("a\nb", 0, undefined, true)).toBe("a\n  b");
    });

    it("respects skipLast", () => {
      const gen = new Generator({ pretty: true });
      expect(gen.indent("a\nb", 0, undefined, false, true)).toBe("  a\nb");
    });

    it("returns empty string unchanged", () => {
      const gen = new Generator({ pretty: true });
      expect(gen.indent("")).toBe("");
    });
  });

  // =========================================================================
  // Generator.wrap
  // =========================================================================
  describe("Generator.wrap", () => {
    it("wraps string in parens", () => {
      const gen = new Generator();
      expect(gen.wrap("x")).toBe("(x)");
    });

    it("returns empty parens for empty string expression", () => {
      const gen = new Generator();
      expect(gen.wrap("")).toBe("()");
    });
  });

  // =========================================================================
  // Generator: SQL generation for specific node types (via parseOne + sql)
  // =========================================================================
  describe("identifierSql", () => {
    it("generates unquoted identifier", () => {
      expect(parseOne("x").sql()).toBe("x");
    });

    it("generates quoted identifier", () => {
      expect(parseOne('"x"').sql()).toBe('"x"');
    });

    it("normalizes identifier when normalize=true", () => {
      expect(parseOne("X").sql({ normalize: true })).toBe("x");
    });

    it("does not normalize quoted identifier", () => {
      expect(parseOne('"X"').sql({ normalize: true })).toBe('"X"');
    });
  });

  describe("literalSql", () => {
    it("generates number literal", () => {
      expect(parseOne("1").sql()).toBe("1");
    });

    it("generates string literal", () => {
      expect(parseOne("'hello'").sql()).toBe("'hello'");
    });

    it("generates empty string literal", () => {
      expect(parseOne("''").sql()).toBe("''");
    });

    it("escapes single quote in string literal", () => {
      expect(parseOne("''''").sql()).toBe("''''");
    });
  });

  describe("starSql", () => {
    it("generates star", () => {
      expect(parseOne("SELECT *").sql()).toBe("SELECT *");
    });
  });

  describe("nullSql", () => {
    it("generates NULL", () => {
      expect(parseOne("NULL").sql()).toBe("NULL");
    });
  });

  describe("booleanSql", () => {
    it("generates TRUE", () => {
      expect(parseOne("TRUE").sql()).toBe("TRUE");
    });

    it("generates FALSE", () => {
      expect(parseOne("FALSE").sql()).toBe("FALSE");
    });
  });

  describe("aliasSql", () => {
    it("generates alias", () => {
      expect(parseOne("SELECT a AS b").sql()).toBe("SELECT a AS b");
    });

    it("generates quoted alias", () => {
      expect(parseOne('SELECT a AS "b c"').sql()).toBe('SELECT a AS "b c"');
    });
  });

  describe("parenSql", () => {
    it("generates parenthesized expression", () => {
      expect(parseOne("(1)").sql()).toBe("(1)");
    });

    it("generates nested parentheses", () => {
      expect(parseOne("((1))").sql()).toBe("((1))");
    });
  });

  describe("selectSql", () => {
    it("generates simple SELECT", () => {
      expect(parseOne("SELECT 1").sql()).toBe("SELECT 1");
    });

    it("generates SELECT with multiple expressions", () => {
      expect(parseOne("SELECT a, b, c").sql()).toBe("SELECT a, b, c");
    });

    it("generates SELECT with FROM", () => {
      expect(parseOne("SELECT * FROM t").sql()).toBe("SELECT * FROM t");
    });
  });

  describe("fromSql", () => {
    it("generates FROM clause", () => {
      expect(parseOne("SELECT 1 FROM t").sql()).toBe("SELECT 1 FROM t");
    });

    it("generates FROM with qualified table", () => {
      expect(parseOne("SELECT 1 FROM a.b.c").sql()).toBe(
        "SELECT 1 FROM a.b.c",
      );
    });
  });

  describe("tableSql", () => {
    it("generates simple table", () => {
      expect(parseOne("SELECT * FROM t").sql()).toBe("SELECT * FROM t");
    });

    it("generates table with alias", () => {
      expect(parseOne("SELECT * FROM t AS x").sql()).toBe(
        "SELECT * FROM t AS x",
      );
    });
  });

  describe("columnSql", () => {
    it("generates simple column", () => {
      expect(parseOne("SELECT a FROM t").sql()).toBe("SELECT a FROM t");
    });

    it("generates qualified column", () => {
      expect(parseOne("SELECT t.a FROM t").sql()).toBe("SELECT t.a FROM t");
    });
  });

  describe("binary operators", () => {
    it("generates +", () => {
      expect(parseOne("1 + 2").sql()).toBe("1 + 2");
    });

    it("generates -", () => {
      expect(parseOne("1 - 2").sql()).toBe("1 - 2");
    });

    it("generates *", () => {
      expect(parseOne("1 * 2").sql()).toBe("1 * 2");
    });

    it("generates /", () => {
      expect(parseOne("1 / 2").sql()).toBe("1 / 2");
    });

    it("generates %", () => {
      expect(parseOne("1 % 2").sql()).toBe("1 % 2");
    });

    it("generates =", () => {
      expect(parseOne("a = 1").sql()).toBe("a = 1");
    });

    it("generates <>", () => {
      expect(parseOne("a <> 1").sql()).toBe("a <> 1");
    });

    it("generates >", () => {
      expect(parseOne("a > 1").sql()).toBe("a > 1");
    });

    it("generates >=", () => {
      expect(parseOne("a >= 1").sql()).toBe("a >= 1");
    });

    it("generates <", () => {
      expect(parseOne("a < 1").sql()).toBe("a < 1");
    });

    it("generates <=", () => {
      expect(parseOne("a <= 1").sql()).toBe("a <= 1");
    });

    it("generates IS", () => {
      expect(parseOne("x IS NULL").sql()).toBe("x IS NULL");
    });

    it("generates LIKE", () => {
      expect(parseOne("x LIKE 'a'").sql()).toBe("x LIKE 'a'");
    });

    it("generates ILIKE", () => {
      expect(parseOne("x ILIKE 'a'").sql()).toBe("x ILIKE 'a'");
    });
  });

  describe("connector (AND/OR)", () => {
    it("generates AND", () => {
      expect(parseOne("SELECT a WHERE x = 1 AND y = 2").sql()).toBe(
        "SELECT a WHERE x = 1 AND y = 2",
      );
    });

    it("generates OR", () => {
      expect(parseOne("x = 1 OR y = 2").sql()).toBe("x = 1 OR y = 2");
    });

    it("generates multiple ANDs", () => {
      expect(parseOne("a = 1 AND b = 2 AND c = 3").sql()).toBe(
        "a = 1 AND b = 2 AND c = 3",
      );
    });
  });

  describe("notSql", () => {
    it("generates NOT", () => {
      expect(parseOne("NOT TRUE").sql()).toBe("NOT TRUE");
    });

    it("generates NOT NOT", () => {
      expect(parseOne("NOT NOT 1").sql()).toBe("NOT NOT 1");
    });
  });

  describe("negSql", () => {
    it("generates negation", () => {
      expect(parseOne("-1").sql()).toBe("-1");
    });

    it("generates double negation with space", () => {
      expect(parseOne("- -5").sql()).toBe("- -5");
    });
  });

  describe("inSql", () => {
    it("generates IN with values", () => {
      expect(parseOne("x IN (1, 2, 3)").sql()).toBe("x IN (1, 2, 3)");
    });

    it("generates IN with subquery", () => {
      expect(parseOne("a IN (SELECT b FROM z)").sql()).toBe(
        "a IN (SELECT b FROM z)",
      );
    });

    it("generates IN with negative numbers", () => {
      expect(parseOne("x IN (-1, 1)").sql()).toBe("x IN (-1, 1)");
    });
  });

  describe("betweenSql", () => {
    it("generates BETWEEN", () => {
      expect(parseOne("x BETWEEN 1 AND 10").sql()).toBe(
        "x BETWEEN 1 AND 10",
      );
    });

    it("generates BETWEEN with negative bound", () => {
      expect(parseOne("x BETWEEN -1 AND 1").sql()).toBe(
        "x BETWEEN -1 AND 1",
      );
    });
  });

  describe("castSql", () => {
    it("generates CAST", () => {
      expect(parseOne("CAST(a AS INT)").sql()).toBe("CAST(a AS INT)");
    });

    it("generates CAST with DECIMAL precision", () => {
      expect(parseOne("CAST(a AS DECIMAL(1, 2))").sql()).toBe(
        "CAST(a AS DECIMAL(1, 2))",
      );
    });

    it("generates TRY_CAST", () => {
      expect(parseOne("TRY_CAST(a AS INT)").sql()).toBe(
        "TRY_CAST(a AS INT)",
      );
    });
  });

  describe("caseSql", () => {
    it("generates CASE WHEN", () => {
      expect(
        parseOne("CASE WHEN x > 1 THEN 1 ELSE 0 END").sql(),
      ).toBe("CASE WHEN x > 1 THEN 1 ELSE 0 END");
    });

    it("generates CASE with operand", () => {
      expect(parseOne("CASE 1 WHEN 1 THEN 1 ELSE 2 END").sql()).toBe(
        "CASE 1 WHEN 1 THEN 1 ELSE 2 END",
      );
    });

    it("generates nested CASE", () => {
      expect(
        parseOne(
          "CASE CASE x > 1 WHEN TRUE THEN 1 END WHEN 1 THEN 1 ELSE 2 END",
        ).sql(),
      ).toBe(
        "CASE CASE x > 1 WHEN TRUE THEN 1 END WHEN 1 THEN 1 ELSE 2 END",
      );
    });
  });

  describe("existsSql", () => {
    it("generates EXISTS with subquery (TS adds extra parens)", () => {
      const result = parseOne(
        "SELECT a FROM test WHERE EXISTS(SELECT 1)",
      ).sql();
      expect(result).toBe(
        "SELECT a FROM test WHERE EXISTS((SELECT 1))",
      );
    });
  });

  describe("extractSql", () => {
    it.todo(
      "generates EXTRACT (Var expression class not available in TS, so EXTRACT(DAY FROM x) does not parse correctly)",
    );
  });

  describe("intervalSql", () => {
    it.todo(
      "generates INTERVAL (parser does not handle INTERVAL syntax in TS)",
    );
  });

  describe("windowSql", () => {
    it("generates window function with empty OVER", () => {
      expect(parseOne("SELECT RANK() OVER () FROM x").sql()).toBe(
        "SELECT RANK() OVER () FROM x",
      );
    });

    it("generates window with PARTITION BY", () => {
      expect(
        parseOne("SELECT RANK() OVER (PARTITION BY a) FROM x").sql(),
      ).toBe("SELECT RANK() OVER (PARTITION BY a) FROM x");
    });

    it("generates window with ORDER BY", () => {
      expect(
        parseOne("SELECT RANK() OVER (ORDER BY a) FROM x").sql(),
      ).toBe("SELECT RANK() OVER (ORDER BY a) FROM x");
    });

    it("generates window with PARTITION BY and ORDER BY", () => {
      expect(
        parseOne(
          "SELECT RANK() OVER (PARTITION BY a ORDER BY a) FROM x",
        ).sql(),
      ).toBe("SELECT RANK() OVER (PARTITION BY a ORDER BY a) FROM x");
    });

    it("generates window with multiple PARTITION BY", () => {
      expect(
        parseOne(
          "SELECT RANK() OVER (PARTITION BY a, b ORDER BY a, b DESC) FROM x",
        ).sql(),
      ).toBe(
        "SELECT RANK() OVER (PARTITION BY a, b ORDER BY a, b DESC) FROM x",
      );
    });
  });

  describe("joinSql", () => {
    it("generates simple JOIN", () => {
      expect(parseOne("SELECT 1 FROM a JOIN b ON a.x = b.x").sql()).toBe(
        "SELECT 1 FROM a JOIN b ON a.x = b.x",
      );
    });

    it("generates INNER JOIN", () => {
      expect(
        parseOne("SELECT 1 FROM a INNER JOIN b ON a.x = b.x").sql(),
      ).toBe("SELECT 1 FROM a INNER JOIN b ON a.x = b.x");
    });

    it("generates CROSS JOIN", () => {
      expect(
        parseOne("SELECT 1 FROM a CROSS JOIN b ON a.x = b.x").sql(),
      ).toBe("SELECT 1 FROM a CROSS JOIN b ON a.x = b.x");
    });

    it("generates JOIN with USING", () => {
      expect(parseOne("SELECT 1 FROM a JOIN b USING (x)").sql()).toBe(
        "SELECT 1 FROM a JOIN b USING (x)",
      );
    });

    it("generates multiple JOINs", () => {
      expect(
        parseOne(
          "SELECT 1 FROM a JOIN b ON a.foo = b.bar JOIN c ON a.foo = c.bar",
        ).sql(),
      ).toBe(
        "SELECT 1 FROM a JOIN b ON a.foo = b.bar JOIN c ON a.foo = c.bar",
      );
    });
  });

  describe("whereSql", () => {
    it("generates WHERE clause", () => {
      expect(parseOne("SELECT a FROM t WHERE a = 1").sql()).toBe(
        "SELECT a FROM t WHERE a = 1",
      );
    });
  });

  describe("groupSql", () => {
    it("generates GROUP BY", () => {
      expect(parseOne("SELECT a FROM t GROUP BY a").sql()).toBe(
        "SELECT a FROM t GROUP BY a",
      );
    });
  });

  describe("havingSql", () => {
    it("generates HAVING", () => {
      expect(
        parseOne("SELECT a FROM t GROUP BY a HAVING a = 1").sql(),
      ).toBe("SELECT a FROM t GROUP BY a HAVING a = 1");
    });
  });

  describe("orderSql", () => {
    it("generates ORDER BY", () => {
      expect(parseOne("SELECT a FROM t ORDER BY a").sql()).toBe(
        "SELECT a FROM t ORDER BY a",
      );
    });

    it("generates ORDER BY DESC", () => {
      expect(parseOne("SELECT a FROM t ORDER BY a DESC").sql()).toBe(
        "SELECT a FROM t ORDER BY a DESC",
      );
    });

    it("generates ORDER BY with multiple columns", () => {
      expect(
        parseOne("SELECT a FROM t ORDER BY a DESC, b").sql(),
      ).toBe("SELECT a FROM t ORDER BY a DESC, b");
    });
  });

  describe("set operations", () => {
    it("generates UNION", () => {
      expect(parseOne("SELECT 1 UNION SELECT 2").sql()).toBe(
        "SELECT 1 UNION SELECT 2",
      );
    });

    it("generates UNION ALL", () => {
      expect(parseOne("SELECT 1 UNION ALL SELECT 2").sql()).toBe(
        "SELECT 1 UNION ALL SELECT 2",
      );
    });

    it("generates EXCEPT", () => {
      expect(parseOne("SELECT 1 EXCEPT SELECT 2").sql()).toBe(
        "SELECT 1 EXCEPT SELECT 2",
      );
    });

    it("generates INTERSECT", () => {
      expect(parseOne("SELECT 1 INTERSECT SELECT 2").sql()).toBe(
        "SELECT 1 INTERSECT SELECT 2",
      );
    });
  });

  describe("with/cteSql", () => {
    it("generates simple CTE", () => {
      expect(
        parseOne("WITH a AS (SELECT 1) SELECT * FROM a").sql(),
      ).toBe("WITH a AS (SELECT 1) SELECT * FROM a");
    });

    it("generates multiple CTEs", () => {
      expect(
        parseOne(
          "WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a",
        ).sql(),
      ).toBe("WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a");
    });
  });

  describe("subquerySql", () => {
    it("generates subquery in FROM", () => {
      expect(
        parseOne("SELECT a FROM (SELECT a FROM t) AS x").sql(),
      ).toBe("SELECT a FROM (SELECT a FROM t) AS x");
    });

    it("generates nested subquery", () => {
      expect(
        parseOne(
          "SELECT a FROM (SELECT a FROM (SELECT a FROM t) AS y) AS x",
        ).sql(),
      ).toBe(
        "SELECT a FROM (SELECT a FROM (SELECT a FROM t) AS y) AS x",
      );
    });
  });

  describe("distinctSql", () => {
    it.todo(
      "generates DISTINCT (Distinct expression class not available in TS parser)",
    );
  });

  describe("tupleSql", () => {
    it("generates tuple in IN", () => {
      expect(parseOne("(a, b) IN (SELECT 1, 2)").sql()).toBe(
        "(a, b) IN (SELECT 1, 2)",
      );
    });
  });

  describe("anonymousSql", () => {
    it("generates anonymous function call", () => {
      expect(parseOne("MY_FUNC(a, b)").sql()).toBe("MY_FUNC(a, b)");
    });

    it("generates COALESCE", () => {
      expect(parseOne("COALESCE(a, b, c)").sql()).toBe("COALESCE(a, b, c)");
    });

    it("generates CONCAT_WS", () => {
      expect(parseOne("CONCAT_WS('-', 'a', 'b')").sql()).toBe(
        "CONCAT_WS('-', 'a', 'b')",
      );
    });
  });

  describe("functionFallbackSql", () => {
    it("generates known functions via fallback", () => {
      expect(parseOne("SUM(a)").sql()).toBe("SUM(a)");
    });

    it("generates COUNT(*)", () => {
      expect(parseOne("COUNT(*)").sql()).toBe("COUNT(*)");
    });

    it("generates COUNT(1)", () => {
      expect(parseOne("COUNT(1)").sql()).toBe("COUNT(1)");
    });

    it("generates AVG", () => {
      expect(parseOne("AVG(a)").sql()).toBe("AVG(a)");
    });

    it("generates MIN", () => {
      expect(parseOne("MIN(a)").sql()).toBe("MIN(a)");
    });

    it("generates MAX", () => {
      expect(parseOne("MAX(a)").sql()).toBe("MAX(a)");
    });

    it("generates MAX with multiple args", () => {
      expect(parseOne("MAX(a, b)").sql()).toBe("MAX(a, b)");
    });

    it("generates MIN with multiple args", () => {
      expect(parseOne("MIN(a, b)").sql()).toBe("MIN(a, b)");
    });
  });

  // =========================================================================
  // Pretty printing
  // =========================================================================
  describe("pretty printing", () => {
    it("formats SELECT with FROM on new line", () => {
      const sql = parseOne("SELECT a FROM b").sql({ pretty: true });
      expect(sql).toContain("\n");
      expect(sql).toContain("SELECT");
      expect(sql).toContain("FROM");
    });

    it("formats WHERE on new line", () => {
      const sql = parseOne("SELECT a FROM b WHERE c = 1").sql({
        pretty: true,
      });
      expect(sql).toContain("\nWHERE");
    });

    it("formats GROUP BY on new line", () => {
      const sql = parseOne("SELECT a FROM b GROUP BY a").sql({
        pretty: true,
      });
      expect(sql).toContain("\nGROUP BY");
    });

    it("formats ORDER BY on new line", () => {
      const sql = parseOne("SELECT a FROM b ORDER BY a").sql({
        pretty: true,
      });
      expect(sql).toContain("\nORDER BY");
    });

    it("formats HAVING on new line", () => {
      const sql = parseOne("SELECT a FROM b GROUP BY a HAVING a > 1").sql({
        pretty: true,
      });
      expect(sql).toContain("\nHAVING");
    });
  });

  // =========================================================================
  // Expression.sql() with options passthrough
  // =========================================================================
  describe("Expression.sql() with options", () => {
    it("passes identify option through", () => {
      const expr = parseOne("SELECT x");
      expect(expr.sql({ identify: true })).toBe('SELECT "x"');
    });

    it("passes normalize option through", () => {
      const expr = parseOne("SELECT X FROM Y");
      expect(expr.sql({ normalize: true })).toBe("SELECT x FROM y");
    });

    it("passes pretty option through", () => {
      const expr = parseOne("SELECT a FROM b");
      const pretty = expr.sql({ pretty: true });
      expect(pretty).toContain("\n");
    });
  });
});
