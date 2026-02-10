import { describe, it, expect } from "vitest";
import { parseOne, transpile } from "../src/index.js";

describe("sqlglot-ts smoke tests", () => {
  it("parses and generates SELECT 1", () => {
    expect(parseOne("SELECT 1").sql()).toBe("SELECT 1");
  });

  it("parses and generates SELECT with columns and FROM", () => {
    expect(parseOne("SELECT a, b FROM t").sql()).toBe("SELECT a, b FROM t");
  });

  it("parses and generates SELECT * with WHERE", () => {
    expect(parseOne("SELECT * FROM t WHERE x = 1").sql()).toBe(
      "SELECT * FROM t WHERE x = 1",
    );
  });

  it("parses and generates string literal", () => {
    expect(parseOne("SELECT 'hello'").sql()).toBe("SELECT 'hello'");
  });

  it("parses and generates NULL, TRUE, FALSE", () => {
    expect(parseOne("SELECT NULL, TRUE, FALSE").sql()).toBe(
      "SELECT NULL, TRUE, FALSE",
    );
  });

  it("parses and generates alias", () => {
    expect(parseOne("SELECT a AS b FROM t").sql()).toBe(
      "SELECT a AS b FROM t",
    );
  });

  it("transpiles a simple query", () => {
    const result = transpile("SELECT 1");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("SELECT 1");
  });
});
