import { describe, it, expect } from "vitest";
import { parseOne } from "../src/index.js";
import {
  Expression,
  Select,
  Column,
  Identifier,
  Literal,
  Star,
  Table,
  DataType,
  Cast,
  Add,
  Neg,
  Paren,
  And,
  Or,
  Not,
  Where,
  From,
  Alias,
} from "../src/expressions.js";

/**
 * Tests for AST transforms.
 *
 * The Python sqlglot has a `transforms.py` module with standalone transform functions
 * (eliminate_distinct_on, eliminate_qualify, eliminate_join_marks, eliminate_window_clause,
 * remove_precision_parameterized_types, inherit_struct_field_names).
 *
 * These standalone transform functions have NOT been ported to TS yet, so tests for them
 * are marked as todo. However, the `.transform()` method on Expression IS available,
 * so we test its behavior extensively using equivalent patterns.
 */

// =============================================================================
// Tests for standalone transform functions (NOT YET PORTED to TS)
// =============================================================================

describe("TestTransforms - eliminate_distinct_on", () => {
  it.todo(
    "DISTINCT ON with ORDER BY rewrites to ROW_NUMBER subquery (eliminate_distinct_on not ported)",
  );
  it.todo(
    "DISTINCT ON without ORDER BY uses partition columns for ORDER BY (eliminate_distinct_on not ported)",
  );
  it.todo(
    "DISTINCT ON with multiple partition columns (eliminate_distinct_on not ported)",
  );
  it.todo(
    "plain DISTINCT (no ON) is unchanged (eliminate_distinct_on not ported)",
  );
  it.todo(
    "DISTINCT ON with name collision uses _row_number_2 (eliminate_distinct_on not ported)",
  );
  it.todo(
    "DISTINCT ON with qualified columns (eliminate_distinct_on not ported)",
  );
  it.todo(
    "DISTINCT ON with CROSS JOIN deduplicates aliases (eliminate_distinct_on not ported)",
  );
  it.todo(
    "DISTINCT ON with expression column uses _col alias (eliminate_distinct_on not ported)",
  );
  it.todo(
    "DISTINCT ON with star preserves star (eliminate_distinct_on not ported)",
  );
  it.todo(
    "DISTINCT ON with explicit alias preserves alias (eliminate_distinct_on not ported)",
  );
  it.todo(
    "DISTINCT ON with quoted identifier column (eliminate_distinct_on not ported)",
  );
});

describe("TestTransforms - eliminate_qualify", () => {
  it.todo(
    "QUALIFY with ROW_NUMBER rewrites to subquery with _w (eliminate_qualify not ported)",
  );
  it.todo(
    "QUALIFY with AND condition preserves both conditions (eliminate_qualify not ported)",
  );
  it.todo(
    "QUALIFY preserves columns already in SELECT (eliminate_qualify not ported)",
  );
  it.todo(
    "QUALIFY with named window function (row_num) (eliminate_qualify not ported)",
  );
  it.todo(
    "QUALIFY with star SELECT (eliminate_qualify not ported)",
  );
  it.todo(
    "QUALIFY with subquery IN clause (eliminate_qualify not ported)",
  );
  it.todo(
    "QUALIFY without comparison (bare window) (eliminate_qualify not ported)",
  );
  it.todo(
    "QUALIFY resolves column aliases in PARTITION BY (eliminate_qualify not ported)",
  );
  it.todo(
    "QUALIFY resolves UDF alias in ORDER BY (eliminate_qualify not ported)",
  );
  it.todo(
    "QUALIFY resolves concatenation alias in ORDER BY (eliminate_qualify not ported)",
  );
  it.todo(
    "QUALIFY resolves qualified column aliases (eliminate_qualify not ported)",
  );
  it.todo(
    "QUALIFY resolves window function alias in ORDER BY (eliminate_qualify not ported)",
  );
});

describe("TestTransforms - remove_precision_parameterized_types", () => {
  it.todo(
    "removes precision from DECIMAL(10, 2) and VARCHAR(10) (remove_precision_parameterized_types not ported)",
  );
});

describe("TestTransforms - eliminate_join_marks", () => {
  it.todo(
    "no join marks leaves query unchanged (eliminate_join_marks not ported)",
  );
  it.todo(
    "right-side (+) becomes LEFT JOIN (eliminate_join_marks not ported)",
  );
  it.todo(
    "left-side (+) swaps table order (eliminate_join_marks not ported)",
  );
  it.todo(
    "join mark with IS NULL in ON clause (eliminate_join_marks not ported)",
  );
  it.todo(
    "join mark with non-marked IS NULL goes to WHERE (eliminate_join_marks not ported)",
  );
  it.todo(
    "join mark with non-participating WHERE clause (eliminate_join_marks not ported)",
  );
  it.todo(
    "simple (+) on column (eliminate_join_marks not ported)",
  );
  it.todo(
    "multiple tables with chained join marks (eliminate_join_marks not ported)",
  );
  it.todo(
    "two join marks on one side of predicate (eliminate_join_marks not ported)",
  );
  it.todo(
    "join mark with expression (eliminate_join_marks not ported)",
  );
  it.todo(
    "join mark with non-participating CROSS JOIN (eliminate_join_marks not ported)",
  );
  it.todo(
    "join mark in subquery (eliminate_join_marks not ported)",
  );
  it.todo(
    "multiple conditions remain consistent (eliminate_join_marks not ported)",
  );
  it.todo(
    "join mark with parenthesized WHERE (eliminate_join_marks not ported)",
  );
  it.todo(
    "join mark in CASE expression (eliminate_join_marks not ported)",
  );
  it.todo(
    "join mark with OR (eliminate_join_marks not ported)",
  );
  it.todo(
    "join mark in correlated subquery raises error (eliminate_join_marks not ported)",
  );
});

describe("TestTransforms - eliminate_window_clause", () => {
  it.todo(
    "WINDOW clause with chain of references is inlined (eliminate_window_clause not ported)",
  );
  it.todo(
    "nested subquery WINDOW clauses are each inlined (eliminate_window_clause not ported)",
  );
});

describe("TestTransforms - inherit_struct_field_names", () => {
  it.todo(
    "field names inherited from first struct (inherit_struct_field_names not ported)",
  );
  it.todo(
    "single struct in array: no inheritance needed (inherit_struct_field_names not ported)",
  );
  it.todo(
    "empty array: no change (inherit_struct_field_names not ported)",
  );
  it.todo(
    "first struct has no field names: no inheritance (inherit_struct_field_names not ported)",
  );
  it.todo(
    "mismatched field counts: skip inheritance (inherit_struct_field_names not ported)",
  );
  it.todo(
    "struct already has field names: don't override (inherit_struct_field_names not ported)",
  );
  it.todo(
    "mixed: some structs inherit, some already have names (inherit_struct_field_names not ported)",
  );
  it.todo(
    "non-struct elements: no change (inherit_struct_field_names not ported)",
  );
  it.todo(
    "multiple arrays: each processed independently (inherit_struct_field_names not ported)",
  );
  it.todo(
    "partial field names in first struct: inherit only the named ones (inherit_struct_field_names not ported)",
  );
});

// =============================================================================
// Tests for Expression.transform() method
// These exercise the same transform mechanism used by the Python transforms.
// =============================================================================

describe("TestTransforms - Expression.transform() basics", () => {
  it("transform with identity function returns equal expression", () => {
    const expression = parseOne("SELECT a, b FROM x WHERE c = 1");
    const transformed = expression.transform((node) => node);
    expect(transformed.sql()).toBe("SELECT a, b FROM x WHERE c = 1");
  });

  it("transform creates a copy by default", () => {
    const expression = parseOne("SELECT a, b FROM x");
    const transformed = expression.transform((node) => node);
    expect(transformed).not.toBe(expression);
    expect(transformed.sql()).toBe(expression.sql());
  });

  it("transform with copy: false mutates in place", () => {
    const expression = parseOne("SELECT a, b FROM x");
    const transformed = expression.transform((node) => node, { copy: false });
    expect(transformed).toBe(expression);
  });
});

describe("TestTransforms - Expression.transform() column replacement", () => {
  it("replaces a specific column by name", () => {
    const expression = parseOne("SELECT a, b FROM x");

    function replaceA(node: Expression): Expression {
      if (node instanceof Column && node.name === "a") {
        return parseOne("c");
      }
      return node;
    }

    const transformed = expression.transform(replaceA);
    expect(transformed.sql()).toBe("SELECT c, b FROM x");
  });

  it("replaces column with arithmetic expression", () => {
    const expression = parseOne("SELECT a, b FROM x");

    function replaceA(node: Expression): Expression {
      if (node instanceof Column && node.name === "a") {
        return parseOne("c - 2");
      }
      return node;
    }

    const transformed = expression.transform(replaceA);
    expect(transformed.sql()).toBe("SELECT c - 2, b FROM x");
  });

  it("original expression is unchanged after transform with copy", () => {
    const expression = parseOne("SELECT a, b FROM x");

    function replaceA(node: Expression): Expression {
      if (node instanceof Column && node.name === "a") {
        return parseOne("z");
      }
      return node;
    }

    const transformed = expression.transform(replaceA);
    expect(transformed.sql()).toBe("SELECT z, b FROM x");
    expect(expression.sql()).toBe("SELECT a, b FROM x");
  });

  it("copy: false modifies original expression", () => {
    const expression = parseOne("SELECT a, b FROM x");

    function replaceA(node: Expression): Expression {
      if (node instanceof Column && node.name === "a") {
        return parseOne("z");
      }
      return node;
    }

    const transformed = expression.transform(replaceA, { copy: false });
    expect(transformed.sql()).toBe("SELECT z, b FROM x");
    expect(transformed).toBe(expression);
  });

  it("replaces all columns matching a condition", () => {
    const expression = parseOne("SELECT a, b, c FROM x");

    function uppercaseColumns(node: Expression): Expression {
      if (node instanceof Column) {
        return parseOne(`"${node.name.toUpperCase()}"`);
      }
      return node;
    }

    const transformed = expression.transform(uppercaseColumns);
    expect(transformed.sql()).toBe('SELECT "A", "B", "C" FROM x');
  });
});

describe("TestTransforms - Expression.transform() node removal", () => {
  it("removes a specific column from SELECT", () => {
    const expression = parseOne("SELECT a, b, c FROM x");

    function removeB(node: Expression): Expression | null {
      if (node instanceof Column && node.name === "b") {
        return null;
      }
      return node;
    }

    expect(expression.transform(removeB).sql()).toBe("SELECT a, c FROM x");
  });

  it("removes all columns from SELECT", () => {
    const expression = parseOne("SELECT a, b FROM x");

    function removeColumns(node: Expression): Expression | null {
      if (node instanceof Column) {
        return null;
      }
      return node;
    }

    expect(expression.transform(removeColumns).sql()).toBe("SELECT FROM x");
  });

  it("removes DataType from Cast", () => {
    const expression = parseOne("CAST(x AS FLOAT)");

    function removeDataType(node: Expression): Expression | null {
      if (node instanceof DataType) {
        return null;
      }
      return node;
    }

    const result = expression.transform(removeDataType).sql();
    // Generator may produce "CAST(x AS )" with trailing space -- normalize
    expect(result.replace(/\s+\)/g, ")")).toBe("CAST(x AS)");
  });

  it("removes WHERE clause contents", () => {
    const expression = parseOne("SELECT a FROM x WHERE a > 1 AND b = 2");

    function removeAnds(node: Expression): Expression | null {
      if (node instanceof And) {
        return null;
      }
      return node;
    }

    const result = expression.transform(removeAnds);
    expect(result.sql()).toBe("SELECT a FROM x WHERE");
  });
});

describe("TestTransforms - Expression.transform() no infinite recursion", () => {
  it("does not loop when transform introduces same node type", () => {
    const expression = parseOne("a");

    function wrapInFunction(node: Expression): Expression {
      if (node instanceof Column && node.name === "a") {
        return parseOne("FUN(a)");
      }
      return node;
    }

    expect(expression.transform(wrapInFunction).sql()).toBe("FUN(a)");
  });

  it("does not loop when replacing with nested structure", () => {
    const expression = parseOne("SELECT a FROM x");

    function replaceA(node: Expression): Expression {
      if (node instanceof Column && node.name === "a") {
        return parseOne("a + 1");
      }
      return node;
    }

    const result = expression.transform(replaceA).sql();
    expect(result).toBe("SELECT a + 1 FROM x");
  });
});

describe("TestTransforms - Expression.transform() with multiple children", () => {
  it("replaces Star with multiple columns", () => {
    const expression = parseOne("SELECT * FROM x");

    function expandStar(node: Expression): Expression | Expression[] {
      if (node instanceof Star) {
        return [parseOne("a"), parseOne("b")];
      }
      return node;
    }

    expect(expression.transform(expandStar as any).sql()).toBe(
      "SELECT a, b FROM x",
    );
  });

  it("replaces Star with three columns", () => {
    const expression = parseOne("SELECT * FROM x");

    function expandStar(node: Expression): Expression | Expression[] {
      if (node instanceof Star) {
        return [parseOne("a"), parseOne("b"), parseOne("c")];
      }
      return node;
    }

    expect(expression.transform(expandStar as any).sql()).toBe(
      "SELECT a, b, c FROM x",
    );
  });
});

describe("TestTransforms - Expression.transform() table replacement", () => {
  it("replaces table name", () => {
    const expression = parseOne("SELECT a FROM old_table");

    function renameTable(node: Expression): Expression {
      if (node instanceof Table && node.name === "old_table") {
        return new Table({ this: new Identifier({ this: "new_table" }) });
      }
      return node;
    }

    expect(expression.transform(renameTable).sql()).toBe(
      "SELECT a FROM new_table",
    );
  });

  it("replaces all tables in join", () => {
    const expression = parseOne("SELECT * FROM a JOIN b ON a.id = b.id");
    const mapping: Record<string, string> = { a: "alpha", b: "beta" };

    function renameTables(node: Expression): Expression {
      if (node instanceof Table && mapping[node.name]) {
        return new Table({
          this: new Identifier({ this: mapping[node.name] }),
        });
      }
      return node;
    }

    const result = expression.transform(renameTables).sql();
    expect(result).toBe("SELECT * FROM alpha JOIN beta ON a.id = b.id");
  });
});

describe("TestTransforms - Expression.transform() literal replacement", () => {
  it("doubles all numeric literals", () => {
    const expression = parseOne("SELECT 1 + 2");

    function doubleLiterals(node: Expression): Expression {
      if (node instanceof Literal && node.isNumber) {
        const val = Number(node.this_) * 2;
        return new Literal({ this: String(val), is_string: false });
      }
      return node;
    }

    expect(expression.transform(doubleLiterals).sql()).toBe("SELECT 2 + 4");
  });

  it("wraps string literals in UPPER()", () => {
    const expression = parseOne("SELECT 'hello'");

    function wrapUpper(node: Expression): Expression {
      if (node instanceof Literal && node.isString) {
        return parseOne(`UPPER('${node.this_}')`);
      }
      return node;
    }

    expect(expression.transform(wrapUpper).sql()).toBe("SELECT UPPER('hello')");
  });
});

describe("TestTransforms - Expression.transform() type-based filtering", () => {
  it("removes single Paren wrappers", () => {
    const expression = parseOne("SELECT (a), (b) FROM x");

    function unwrapParens(node: Expression): Expression {
      if (node instanceof Paren) {
        return node.this_ as Expression;
      }
      return node;
    }

    expect(expression.transform(unwrapParens).sql()).toBe(
      "SELECT a, b FROM x",
    );
  });

  it("nested Parens require multiple passes to fully unwrap", () => {
    // transform() does not recurse into replacement nodes, so
    // double-nested parens like ((b)) only unwrap one level per pass.
    const expression = parseOne("SELECT ((b)) FROM x");

    function unwrapParens(node: Expression): Expression {
      if (node instanceof Paren) {
        return node.this_ as Expression;
      }
      return node;
    }

    // First pass removes outer paren
    const pass1 = expression.transform(unwrapParens);
    expect(pass1.sql()).toBe("SELECT (b) FROM x");

    // Second pass removes inner paren
    const pass2 = pass1.transform(unwrapParens);
    expect(pass2.sql()).toBe("SELECT b FROM x");
  });

  it("removes all aliases", () => {
    const expression = parseOne("SELECT a AS x, b AS y FROM t");

    function removeAliases(node: Expression): Expression {
      if (node instanceof Alias) {
        return node.this_ as Expression;
      }
      return node;
    }

    expect(expression.transform(removeAliases).sql()).toBe(
      "SELECT a, b FROM t",
    );
  });
});

describe("TestTransforms - Expression.transform() complex queries", () => {
  it("transforms columns in subquery", () => {
    const expression = parseOne("SELECT * FROM (SELECT a, b FROM t) AS sub");

    function replaceA(node: Expression): Expression {
      if (node instanceof Column && node.name === "a") {
        return parseOne("x");
      }
      return node;
    }

    expect(expression.transform(replaceA).sql()).toBe(
      "SELECT * FROM (SELECT x, b FROM t) AS sub",
    );
  });

  it("transforms columns in WHERE clause", () => {
    const expression = parseOne("SELECT a FROM x WHERE a > 1");

    function replaceA(node: Expression): Expression {
      if (node instanceof Column && node.name === "a") {
        return parseOne("replaced");
      }
      return node;
    }

    const result = expression.transform(replaceA).sql();
    expect(result).toBe("SELECT replaced FROM x WHERE replaced > 1");
  });

  it("transforms columns in CTE", () => {
    const expression = parseOne(
      "WITH cte AS (SELECT a FROM t) SELECT a FROM cte",
    );

    function replaceA(node: Expression): Expression {
      if (node instanceof Column && node.name === "a") {
        return parseOne("b");
      }
      return node;
    }

    const result = expression.transform(replaceA).sql();
    expect(result).toBe("WITH cte AS (SELECT b FROM t) SELECT b FROM cte");
  });

  it("transforms in UNION queries", () => {
    const expression = parseOne(
      "SELECT a FROM t1 UNION SELECT a FROM t2",
    );

    function replaceA(node: Expression): Expression {
      if (node instanceof Column && node.name === "a") {
        return parseOne("b");
      }
      return node;
    }

    const result = expression.transform(replaceA).sql();
    expect(result).toBe("SELECT b FROM t1 UNION SELECT b FROM t2");
  });
});

describe("TestTransforms - Expression.transform() Cast manipulation", () => {
  it("replaces CAST target type", () => {
    const expression = parseOne("SELECT CAST(x AS INT)");

    function intToVarchar(node: Expression): Expression {
      if (
        node instanceof DataType &&
        node.this_ === DataType.Type.INT
      ) {
        return DataType.build("VARCHAR");
      }
      return node;
    }

    expect(expression.transform(intToVarchar).sql()).toBe(
      "SELECT CAST(x AS VARCHAR)",
    );
  });

  it("removes all CASTs, keeping inner expression", () => {
    const expression = parseOne("SELECT CAST(x AS INT), CAST(y AS VARCHAR)");

    function removeCasts(node: Expression): Expression {
      if (node instanceof Cast) {
        return node.this_ as Expression;
      }
      return node;
    }

    expect(expression.transform(removeCasts).sql()).toBe("SELECT x, y");
  });
});

describe("TestTransforms - Expression.transform() Neg handling", () => {
  it("removes negation", () => {
    const expression = parseOne("SELECT -1");

    function removeNeg(node: Expression): Expression {
      if (node instanceof Neg) {
        return node.this_ as Expression;
      }
      return node;
    }

    expect(expression.transform(removeNeg).sql()).toBe("SELECT 1");
  });
});

describe("TestTransforms - Expression.transform() conditional transforms", () => {
  it("replaces NOT with its operand", () => {
    const expression = parseOne("SELECT * FROM t WHERE NOT a = 1");

    function removeNot(node: Expression): Expression {
      if (node instanceof Not) {
        return node.this_ as Expression;
      }
      return node;
    }

    expect(expression.transform(removeNot).sql()).toBe(
      "SELECT * FROM t WHERE a = 1",
    );
  });

  it("swaps AND to OR", () => {
    const expression = parseOne("SELECT * FROM t WHERE a = 1 AND b = 2");

    function andToOr(node: Expression): Expression {
      if (node instanceof And) {
        return new Or({
          this: node.this_,
          expression: node.expression,
        });
      }
      return node;
    }

    const result = expression.transform(andToOr).sql();
    expect(result).toBe("SELECT * FROM t WHERE a = 1 OR b = 2");
  });
});

describe("TestTransforms - Expression.transform() preserves structure", () => {
  it("transform that touches nothing preserves exact SQL", () => {
    const sqls = [
      "SELECT a, b FROM t WHERE c = 1 ORDER BY a",
      "SELECT * FROM t1 JOIN t2 ON t1.id = t2.id",
      "SELECT a, COUNT(b) FROM t GROUP BY a HAVING COUNT(b) > 1",
      "WITH cte AS (SELECT 1) SELECT * FROM cte",
      "SELECT a FROM t UNION ALL SELECT b FROM u",
    ];

    for (const sql of sqls) {
      const expression = parseOne(sql);
      const transformed = expression.transform((node) => node);
      expect(transformed.sql()).toBe(sql);
    }
  });
});

describe("TestTransforms - simulate remove_precision_parameterized_types", () => {
  it("removes precision params from DataType via findAll + set", () => {
    // This simulates the Python remove_precision_parameterized_types transform
    // by finding DataType nodes and clearing their expressions (precision params).
    const expression = parseOne(
      "SELECT CAST(1 AS DECIMAL(10, 2)), CAST('13' AS VARCHAR(10))",
    );

    // Use findAll + set approach (like the Python transform does)
    for (const dt of expression.findAll(DataType)) {
      const exprs = dt.args["expressions"];
      if (exprs && Array.isArray(exprs) && exprs.length > 0) {
        dt.set("expressions", []);
      }
    }

    expect(expression.sql()).toBe(
      "SELECT CAST(1 AS DECIMAL), CAST('13' AS VARCHAR)",
    );
  });
});

describe("TestTransforms - Expression.transform() chaining", () => {
  it("can chain multiple transforms", () => {
    const expression = parseOne("SELECT a, b FROM x");

    // First transform: rename column a to c
    const step1 = expression.transform((node) => {
      if (node instanceof Column && node.name === "a") {
        return parseOne("c");
      }
      return node;
    });

    // Second transform: rename column b to d
    const step2 = step1.transform((node) => {
      if (node instanceof Column && node.name === "b") {
        return parseOne("d");
      }
      return node;
    });

    expect(step2.sql()).toBe("SELECT c, d FROM x");
    // Original is unchanged
    expect(expression.sql()).toBe("SELECT a, b FROM x");
  });
});
