import { describe, expect, it } from "vitest";
import { transpile, Dialect } from "../../src/index.js";
import "../../src/dialects/prql.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round-trip: parse as PRQL write dialect, generate as PRQL write dialect, compare. */
function validateIdentity(sql: string, writeSql?: string) {
  const result = transpile(sql, { readDialect: "prql", writeDialect: "prql" })[0];
  expect(result).toBe(writeSql ?? sql);
}

/** Parse with readDialect, generate with writeDialect, compare. */
function validateTranspile(
  sql: string,
  opts: {
    read?: string;
    write?: string;
    expected: string;
  },
) {
  const result = transpile(sql, {
    readDialect: opts.read ?? "prql",
    writeDialect: opts.write ?? "prql",
  })[0];
  expect(result).toBe(opts.expected);
}

// ===========================================================================
// Tests
// ===========================================================================

describe("PRQL dialect", () => {
  // -------------------------------------------------------------------------
  // Dialect registration
  // -------------------------------------------------------------------------

  it("should be registered", () => {
    const d = Dialect.getOrRaise("prql");
    expect(d).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Identifier quoting
  // -------------------------------------------------------------------------

  describe("identifier quoting", () => {
    it("backtick-quoted identifiers round-trip", () => {
      validateIdentity("SELECT `col` FROM `table`");
    });

    it("unquoted identifiers round-trip", () => {
      validateIdentity("SELECT col FROM t");
    });

    it("reserved word as identifier", () => {
      validateIdentity("SELECT `select` FROM `table`");
    });
  });

  // -------------------------------------------------------------------------
  // String quoting
  // -------------------------------------------------------------------------

  describe("string quoting", () => {
    it("single-quoted string", () => {
      validateIdentity("SELECT 'hello'");
    });

    it("double-quoted string round-trips as single-quoted", () => {
      // PRQL allows double-quoted strings; generator outputs single-quoted
      validateIdentity('SELECT "hello"', "SELECT 'hello'");
    });
  });

  // -------------------------------------------------------------------------
  // SELECT basics
  // -------------------------------------------------------------------------

  describe("SELECT basics", () => {
    it("SELECT *", () => {
      validateIdentity("SELECT * FROM t");
    });

    it("SELECT with alias", () => {
      validateIdentity("SELECT a AS x, b AS y FROM t");
    });

    it("SELECT DISTINCT", () => {
      validateIdentity("SELECT DISTINCT a FROM t");
    });

    it("SELECT expression", () => {
      validateIdentity("SELECT a + b AS total FROM t");
    });

    it("SELECT with table alias", () => {
      validateIdentity("SELECT t.a FROM t");
    });
  });

  // -------------------------------------------------------------------------
  // WHERE clause
  // -------------------------------------------------------------------------

  describe("WHERE clause", () => {
    // Note: PRQL maps `=` to ALIAS token, so `a = 1` in WHERE is not valid
    // when reading as PRQL. Use comparisons that don't rely on `=`.

    it("WHERE with comparison operators", () => {
      validateIdentity("SELECT * FROM t WHERE a > 1");
    });

    it("WHERE with less-than", () => {
      validateIdentity("SELECT * FROM t WHERE a < 10");
    });

    it("WHERE IN", () => {
      validateIdentity("SELECT * FROM t WHERE a IN (1, 2, 3)");
    });

    it("WHERE IS NULL", () => {
      validateIdentity("SELECT * FROM t WHERE a IS NULL");
    });

    it("WHERE IS NOT NULL", () => {
      validateIdentity("SELECT * FROM t WHERE a IS NOT NULL");
    });

    it("WHERE LIKE", () => {
      validateIdentity("SELECT * FROM t WHERE name LIKE '%test%'");
    });

    it.todo("WHERE with == equality (PRQL uses == not = for equality, requires parser support)");
  });

  // -------------------------------------------------------------------------
  // CAST
  // -------------------------------------------------------------------------

  describe("CAST", () => {
    it("CAST to INT", () => {
      validateIdentity("SELECT CAST(a AS INT)");
    });

    it("CAST to VARCHAR", () => {
      validateIdentity("SELECT CAST(a AS VARCHAR)");
    });

    it("CAST to BOOLEAN", () => {
      validateIdentity("SELECT CAST(a AS BOOLEAN)");
    });
  });

  // -------------------------------------------------------------------------
  // Literals
  // -------------------------------------------------------------------------

  describe("literals", () => {
    it("integer literal", () => {
      validateIdentity("SELECT 42");
    });

    it("float literal", () => {
      validateIdentity("SELECT 3.14");
    });

    it("string literal", () => {
      validateIdentity("SELECT 'hello world'");
    });

    it("NULL literal", () => {
      validateIdentity("SELECT NULL");
    });

    it("TRUE / FALSE", () => {
      validateIdentity("SELECT TRUE, FALSE");
    });
  });

  // -------------------------------------------------------------------------
  // Cross-dialect transpilation
  // -------------------------------------------------------------------------

  describe("cross-dialect transpilation", () => {
    it("default -> prql (basic SELECT)", () => {
      validateTranspile(
        "SELECT col FROM t",
        { read: "sqlglot", expected: "SELECT col FROM t" },
      );
    });

    it("default -> prql (WHERE with =)", () => {
      // Reading from sqlglot dialect where = is EQ, writing to PRQL
      validateTranspile(
        "SELECT col FROM t WHERE id = 1",
        { read: "sqlglot", expected: "SELECT col FROM t WHERE id = 1" },
      );
    });

    it("prql -> default (basic SELECT)", () => {
      validateTranspile(
        "SELECT col FROM t",
        { write: "sqlglot", expected: "SELECT col FROM t" },
      );
    });

    it("prql -> postgres (identifier quoting)", () => {
      validateTranspile(
        "SELECT `col` FROM `t`",
        { write: "postgres", expected: 'SELECT "col" FROM "t"' },
      );
    });

    it("postgres -> prql (identifier quoting)", () => {
      validateTranspile(
        'SELECT "col" FROM "t"',
        { read: "postgres", expected: "SELECT `col` FROM `t`" },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  describe("comments", () => {
    it("single-line comment (--) parses", () => {
      const result = transpile("SELECT a -- comment\nFROM t", {
        readDialect: "prql",
        writeDialect: "prql",
      })[0];
      expect(result).toContain("SELECT");
    });

    it("block comment parses", () => {
      const result = transpile("SELECT /* comment */ a FROM t", {
        readDialect: "prql",
        writeDialect: "prql",
      })[0];
      expect(result).toContain("SELECT");
    });
  });

  // -------------------------------------------------------------------------
  // TODO: PRQL-specific features not yet ported
  // -------------------------------------------------------------------------

  describe("todo: PRQL pipeline syntax (requires custom parser)", () => {
    it.todo("from table | derive { ... } pipeline syntax");
    it.todo("from table | select { ... } pipeline syntax");
    it.todo("from table | filter condition pipeline syntax");
    it.todo("from table | take N pipeline syntax");
    it.todo("from table | sort { +col, -col } pipeline syntax");
    it.todo("from table | aggregate { ... } pipeline syntax");
    it.todo("from table | append table2 set operation");
    it.todo("from table | remove table2 set operation");
    it.todo("from table | intersect table2 set operation");
    it.todo("= alias syntax (PRQL uses = instead of AS)");
    it.todo("&& as AND, || as OR in PRQL expressions");
    it.todo("# single-line comment syntax");
    it.todo("NULL equality (== null becomes IS NULL)");
    it.todo("AVERAGE function mapping to AVG");
    it.todo("SUM wrapping with COALESCE");
  });
});
