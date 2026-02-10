import { describe, it, expect } from "vitest";
import {
  highlightSql,
  ANSI_UNDERLINE,
  ANSI_RESET,
  SqlglotError,
  ParseError,
  TokenError,
  GenerateError,
  OptimizeError,
  UnsupportedError,
  SchemaError,
  ExecuteError,
  ErrorLevel,
  concatMessages,
  mergeErrors,
} from "../src/errors.js";

describe("highlightSql", () => {
  it("single character highlight", () => {
    const sql = "SELECT a FROM t";
    const [formatted, startCtx, highlight, endCtx] = highlightSql(sql, [
      [7, 7],
    ]);

    expect(startCtx).toBe("SELECT ");
    expect(highlight).toBe("a");
    expect(endCtx).toBe(" FROM t");
    expect(formatted).toBe(`SELECT ${ANSI_UNDERLINE}a${ANSI_RESET} FROM t`);
  });

  it("multi character highlight", () => {
    const sql = "SELECT foo FROM table";
    const [formatted, startCtx, highlight, endCtx] = highlightSql(sql, [
      [7, 9],
    ]);

    expect(startCtx).toBe("SELECT ");
    expect(highlight).toBe("foo");
    expect(endCtx).toBe(" FROM table");
    expect(formatted).toBe(
      `SELECT ${ANSI_UNDERLINE}foo${ANSI_RESET} FROM table`,
    );
  });

  it("multiple highlights", () => {
    const sql = "SELECT a, b, c FROM table";
    const [formatted, startCtx, highlight, endCtx] = highlightSql(sql, [
      [7, 7],
      [10, 10],
    ]);

    expect(startCtx).toBe("SELECT ");
    expect(highlight).toBe("a, b");
    expect(endCtx).toBe(", c FROM table");
    expect(formatted).toBe(
      `SELECT ${ANSI_UNDERLINE}a${ANSI_RESET}, ${ANSI_UNDERLINE}b${ANSI_RESET}, c FROM table`,
    );
  });

  it("highlight at end", () => {
    const sql = "SELECT a FROM t";
    const [formatted, startCtx, highlight, endCtx] = highlightSql(sql, [
      [14, 14],
    ]);

    expect(startCtx).toBe("SELECT a FROM ");
    expect(highlight).toBe("t");
    expect(endCtx).toBe("");
    expect(formatted).toBe(`SELECT a FROM ${ANSI_UNDERLINE}t${ANSI_RESET}`);
  });

  it("highlight entire string", () => {
    const sql = "SELECT a";
    const [formatted, startCtx, highlight, endCtx] = highlightSql(sql, [
      [0, 7],
    ]);

    expect(startCtx).toBe("");
    expect(highlight).toBe("SELECT a");
    expect(endCtx).toBe("");
    expect(formatted).toBe(`${ANSI_UNDERLINE}SELECT a${ANSI_RESET}`);
  });

  it("adjacent highlights", () => {
    const sql = "SELECT ab FROM t";
    const [formatted, startCtx, highlight, endCtx] = highlightSql(sql, [
      [7, 7],
      [8, 8],
    ]);

    expect(startCtx).toBe("SELECT ");
    expect(highlight).toBe("ab");
    expect(endCtx).toBe(" FROM t");
    expect(formatted).toBe(
      `SELECT ${ANSI_UNDERLINE}a${ANSI_RESET}${ANSI_UNDERLINE}b${ANSI_RESET} FROM t`,
    );
  });

  it("small context length", () => {
    const sql = "SELECT a, b, c FROM table WHERE x = 1";
    const [formatted, startCtx, highlight, endCtx] = highlightSql(
      sql,
      [
        [7, 7],
        [10, 10],
      ],
      5,
    );

    expect(startCtx).toBe("LECT ");
    expect(highlight).toBe("a, b");
    expect(endCtx).toBe(", c F");
    expect(formatted).toBe(
      `LECT ${ANSI_UNDERLINE}a${ANSI_RESET}, ${ANSI_UNDERLINE}b${ANSI_RESET}, c F`,
    );
  });

  it("empty positions throws", () => {
    const sql = "SELECT a FROM t";
    expect(() => highlightSql(sql, [])).toThrow();
  });

  it("partial overlap", () => {
    const sql = "SELECT foo FROM table";
    const [formatted, startCtx, highlight, endCtx] = highlightSql(sql, [
      [7, 9],
      [8, 10],
    ]);

    expect(startCtx).toBe("SELECT ");
    expect(highlight).toBe("foo ");
    expect(endCtx).toBe("FROM table");
    expect(formatted).toBe(
      `SELECT ${ANSI_UNDERLINE}foo${ANSI_RESET}${ANSI_UNDERLINE} ${ANSI_RESET}FROM table`,
    );
  });

  it("full overlap", () => {
    const sql = "SELECT foobar FROM table";
    const [formatted, startCtx, highlight, endCtx] = highlightSql(sql, [
      [7, 12],
      [9, 11],
    ]);

    expect(startCtx).toBe("SELECT ");
    expect(highlight).toBe("foobar");
    expect(endCtx).toBe(" FROM table");
    expect(formatted).toBe(
      `SELECT ${ANSI_UNDERLINE}foobar${ANSI_RESET} FROM table`,
    );
  });

  it("identical positions", () => {
    const sql = "SELECT a FROM t";
    const [formatted, startCtx, highlight, endCtx] = highlightSql(sql, [
      [7, 7],
      [7, 7],
    ]);

    expect(startCtx).toBe("SELECT ");
    expect(highlight).toBe("a");
    expect(endCtx).toBe(" FROM t");
    expect(formatted).toBe(`SELECT ${ANSI_UNDERLINE}a${ANSI_RESET} FROM t`);
  });

  it("reversed positions", () => {
    const sql = "SELECT a, b FROM table";
    const [formatted, startCtx, highlight, endCtx] = highlightSql(sql, [
      [10, 10],
      [7, 7],
    ]);

    expect(startCtx).toBe("SELECT ");
    expect(highlight).toBe("a, b");
    expect(endCtx).toBe(" FROM table");
    expect(formatted).toBe(
      `SELECT ${ANSI_UNDERLINE}a${ANSI_RESET}, ${ANSI_UNDERLINE}b${ANSI_RESET} FROM table`,
    );
  });

  it("zero context length", () => {
    const sql = "SELECT a, b FROM table";
    const [formatted, startCtx, highlight, endCtx] = highlightSql(
      sql,
      [[7, 7]],
      0,
    );

    expect(startCtx).toBe("");
    expect(endCtx).toBe("");
    expect(highlight).toBe("a");
    expect(formatted).toBe(`${ANSI_UNDERLINE}a${ANSI_RESET}`);
  });
});

describe("error classes", () => {
  it("SqlglotError is an instance of Error", () => {
    const err = new SqlglotError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SqlglotError);
    expect(err.message).toBe("test");
    expect(err.name).toBe("SqlglotError");
  });

  it("ParseError stores errors array", () => {
    const err = new ParseError("parse failed", [
      {
        description: "unexpected token",
        line: 1,
        col: 5,
        start_context: "SEL",
        highlight: "ECT",
        end_context: " *",
        into_expression: null,
      },
    ]);
    expect(err).toBeInstanceOf(SqlglotError);
    expect(err).toBeInstanceOf(ParseError);
    expect(err.errors).toHaveLength(1);
    expect(err.errors[0]!.description).toBe("unexpected token");
    expect(err.errors[0]!.line).toBe(1);
    expect(err.errors[0]!.col).toBe(5);
  });

  it("ParseError.new creates error with detail", () => {
    const err = ParseError.new(
      "msg",
      "desc",
      1,
      10,
      "start",
      "hl",
      "end",
      "expr",
    );
    expect(err).toBeInstanceOf(ParseError);
    expect(err.errors).toHaveLength(1);
    expect(err.errors[0]!.description).toBe("desc");
    expect(err.errors[0]!.line).toBe(1);
    expect(err.errors[0]!.col).toBe(10);
    expect(err.errors[0]!.start_context).toBe("start");
    expect(err.errors[0]!.highlight).toBe("hl");
    expect(err.errors[0]!.end_context).toBe("end");
    expect(err.errors[0]!.into_expression).toBe("expr");
  });

  it("ParseError defaults to empty errors array", () => {
    const err = new ParseError("no details");
    expect(err.errors).toEqual([]);
  });

  it("TokenError is an instance of SqlglotError", () => {
    const err = new TokenError("bad token");
    expect(err).toBeInstanceOf(SqlglotError);
    expect(err.name).toBe("TokenError");
  });

  it("GenerateError is an instance of SqlglotError", () => {
    const err = new GenerateError("gen fail");
    expect(err).toBeInstanceOf(SqlglotError);
    expect(err.name).toBe("GenerateError");
  });

  it("OptimizeError is an instance of SqlglotError", () => {
    const err = new OptimizeError("opt fail");
    expect(err).toBeInstanceOf(SqlglotError);
    expect(err.name).toBe("OptimizeError");
  });

  it("UnsupportedError is an instance of SqlglotError", () => {
    const err = new UnsupportedError("unsupported");
    expect(err).toBeInstanceOf(SqlglotError);
    expect(err.name).toBe("UnsupportedError");
  });

  it("SchemaError is an instance of SqlglotError", () => {
    const err = new SchemaError("schema fail");
    expect(err).toBeInstanceOf(SqlglotError);
    expect(err.name).toBe("SchemaError");
  });

  it("ExecuteError is an instance of SqlglotError", () => {
    const err = new ExecuteError("exec fail");
    expect(err).toBeInstanceOf(SqlglotError);
    expect(err.name).toBe("ExecuteError");
  });
});

describe("ErrorLevel enum", () => {
  it("has IGNORE value", () => {
    expect(ErrorLevel.IGNORE).toBe("IGNORE");
  });

  it("has WARN value", () => {
    expect(ErrorLevel.WARN).toBe("WARN");
  });

  it("has RAISE value", () => {
    expect(ErrorLevel.RAISE).toBe("RAISE");
  });

  it("has IMMEDIATE value", () => {
    expect(ErrorLevel.IMMEDIATE).toBe("IMMEDIATE");
  });
});

describe("concatMessages", () => {
  it("joins messages up to maximum", () => {
    const errors = ["error1", "error2", "error3"];
    const result = concatMessages(errors, 2);
    expect(result).toBe("error1\n\nerror2\n\n... and 1 more");
  });

  it("joins all messages when within maximum", () => {
    const errors = ["error1", "error2"];
    const result = concatMessages(errors, 5);
    expect(result).toBe("error1\n\nerror2");
  });

  it("handles empty errors array", () => {
    const result = concatMessages([], 5);
    expect(result).toBe("");
  });
});

describe("mergeErrors", () => {
  it("flattens error details from multiple ParseErrors", () => {
    const err1 = new ParseError("msg1", [
      { description: "d1", line: 1, col: 1 },
    ]);
    const err2 = new ParseError("msg2", [
      { description: "d2", line: 2, col: 2 },
      { description: "d3", line: 3, col: 3 },
    ]);
    const merged = mergeErrors([err1, err2]);
    expect(merged).toHaveLength(3);
    expect(merged[0]!.description).toBe("d1");
    expect(merged[1]!.description).toBe("d2");
    expect(merged[2]!.description).toBe("d3");
  });

  it("returns empty array for no errors", () => {
    const merged = mergeErrors([]);
    expect(merged).toEqual([]);
  });
});
