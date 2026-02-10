import { describe, it, expect } from "vitest";
import { Tokenizer } from "../src/tokenizer.js";
import { TokenType, Token } from "../src/tokens.js";
import { TokenError } from "../src/errors.js";

describe("TestTokens", () => {
  it("test_space_keywords", () => {
    const cases: [string, number][] = [
      ["group bys", 2],
      [" group bys", 2],
      [" group bys ", 2],
      ["group by)", 2],
      ["group bys)", 3],
      ["group \r", 1],
    ];

    for (const [string, length] of cases) {
      const tokens = new Tokenizer().tokenize(string);
      expect(tokens[0]!.text.toUpperCase()).toContain("GROUP");
      expect(tokens.length).toBe(length);
    }
  });

  it("test_comment_attachment", () => {
    const tokenizer = new Tokenizer();
    const sqlComment: [string, string[]][] = [
      ["/*comment*/ foo", ["comment"]],
      ["/*comment*/ foo --test", ["comment", "test"]],
      ["--comment\nfoo --test", ["comment", "test"]],
      ["foo --comment", ["comment"]],
      ["foo", []],
      ["foo /*comment 1*/ /*comment 2*/", ["comment 1", "comment 2"]],
      ["foo\n-- comment", [" comment"]],
      ["1 /*/2 */", ["/2 "]],
      ["1\n/*comment*/;", ["comment"]],
    ];

    for (const [sql, comment] of sqlComment) {
      const tokens = tokenizer.tokenize(sql);
      expect(tokens[0]!.comments).toEqual(comment);
    }
  });

  it("test_token_line_col", () => {
    let tokens = new Tokenizer().tokenize(
      `SELECT /*
line break
*/
'x
 y',
x`,
    );

    expect(tokens[0]!.line).toBe(1);
    expect(tokens[0]!.col).toBe(6);
    expect(tokens[1]!.line).toBe(5);
    expect(tokens[1]!.col).toBe(3);
    expect(tokens[2]!.line).toBe(5);
    expect(tokens[2]!.col).toBe(4);
    expect(tokens[3]!.line).toBe(6);
    expect(tokens[3]!.col).toBe(1);

    tokens = new Tokenizer().tokenize("SELECT .");

    expect(tokens[1]!.line).toBe(1);
    expect(tokens[1]!.col).toBe(8);

    expect(new Tokenizer().tokenize("'''abc'")[0]!.start).toBe(0);
    expect(new Tokenizer().tokenize("'''abc'")[0]!.end).toBe(6);
    expect(new Tokenizer().tokenize("'abc'")[0]!.start).toBe(0);

    tokens = new Tokenizer().tokenize("SELECT\r\n  1,\r\n  2");

    expect(tokens[0]!.line).toBe(1);
    expect(tokens[0]!.col).toBe(6);
    expect(tokens[1]!.line).toBe(2);
    expect(tokens[1]!.col).toBe(3);
    expect(tokens[2]!.line).toBe(2);
    expect(tokens[2]!.col).toBe(4);
    expect(tokens[3]!.line).toBe(3);
    expect(tokens[3]!.col).toBe(3);

    tokens = new Tokenizer().tokenize("  SELECT\n    100");
    expect(tokens[0]!.line).toBe(1);
    expect(tokens[0]!.col).toBe(8);
    expect(tokens[1]!.line).toBe(2);
    expect(tokens[1]!.col).toBe(7);
  });

  it("test_crlf", () => {
    let tokens = new Tokenizer().tokenize("SELECT a\r\nFROM b");
    let mapped = tokens.map((t) => [t.tokenType, t.text]);

    expect(mapped).toEqual([
      [TokenType.SELECT, "SELECT"],
      [TokenType.VAR, "a"],
      [TokenType.FROM, "FROM"],
      [TokenType.VAR, "b"],
    ]);

    for (const simpleQuery of ["SELECT 1\r\n", "\r\nSELECT 1"]) {
      tokens = new Tokenizer().tokenize(simpleQuery);
      mapped = tokens.map((t) => [t.tokenType, t.text]);

      expect(mapped).toEqual([
        [TokenType.SELECT, "SELECT"],
        [TokenType.NUMBER, "1"],
      ]);
    }
  });

  it("test_command", () => {
    let tokens = new Tokenizer().tokenize("SHOW;");
    expect(tokens[0]!.tokenType).toBe(TokenType.SHOW);
    expect(tokens[1]!.tokenType).toBe(TokenType.SEMICOLON);

    tokens = new Tokenizer().tokenize("EXECUTE");
    expect(tokens[0]!.tokenType).toBe(TokenType.EXECUTE);
    expect(tokens.length).toBe(1);

    tokens = new Tokenizer().tokenize("FETCH;SHOW;");
    expect(tokens[0]!.tokenType).toBe(TokenType.FETCH);
    expect(tokens[1]!.tokenType).toBe(TokenType.SEMICOLON);
    expect(tokens[2]!.tokenType).toBe(TokenType.SHOW);
    expect(tokens[3]!.tokenType).toBe(TokenType.SEMICOLON);
  });

  it("test_error_msg", () => {
    // In the TS tokenizer, unbalanced string quotes produce a TokenError
    expect(() => new Tokenizer().tokenize("foo 'bar")).toThrow(TokenError);
    expect(() => new Tokenizer().tokenize("foo 'bar")).toThrow(/Missing '/);
  });

  it.skip("test_jinja (requires BigQuery dialect)", () => {
    // This test requires BigQuery dialect which is not yet ported
  });

  it("test_partial_token_list", () => {
    const tokenizer = new Tokenizer();

    try {
      // This is expected to fail due to the unbalanced string quotes
      tokenizer.tokenize("foo 'bar");
    } catch (e) {
      expect(e).toBeInstanceOf(TokenError);
      expect(String(e)).toContain("Missing '");
    }

    const partialTokens = tokenizer.tokens;

    expect(partialTokens.length).toBe(1);
    expect(partialTokens[0]!.tokenType).toBe(TokenType.VAR);
    expect(partialTokens[0]!.text).toBe("foo");
  });

  it("test_token_toString", () => {
    // Ensures the TypeScript tokenizer produces a human-friendly representation
    const tokens = new Tokenizer().tokenize("foo");
    expect(tokens.length).toBe(1);
    expect(tokens[0]!.toString()).toBe(
      "<Token tokenType: VAR, text: foo, line: 1, col: 3, start: 0, end: 2, comments: []>",
    );
  });
});
