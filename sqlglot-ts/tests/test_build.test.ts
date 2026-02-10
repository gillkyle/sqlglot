import { describe, it, expect } from "vitest";
import { parseOne } from "../src/index.js";
import {
  Select,
  Column,
  Identifier,
  Literal,
  Table,
  From,
  Alias,
  Star,
  Null,
  Boolean_,
  Add,
  And,
  Or,
  Not,
  EQ,
  Condition,
  Join,
  Ordered,
  Subquery,
  Case,
  Cast,
  select,
  from_,
  condition,
  and_,
  or_,
  not_,
  null_,
  column,
  cast,
  toIdentifier,
  toColumn,
  maybeParse,
} from "../src/expressions.js";

describe("test_build", () => {
  // =========================================================================
  // select basics
  // =========================================================================
  describe("select basics", () => {
    it("select single column", () => {
      expect(select("x").sql()).toBe("SELECT x");
    });

    it("select multiple columns", () => {
      expect(select("x", "y").sql()).toBe("SELECT x, y");
    });

    it("select from table", () => {
      expect(select("x").from_("tbl").sql()).toBe("SELECT x FROM tbl");
    });

    it("select multiple columns from table", () => {
      expect(select("x", "y").from_("tbl").sql()).toBe("SELECT x, y FROM tbl");
    });

    it("select then chain select", () => {
      expect(select("x").select("y").from_("tbl").sql()).toBe("SELECT x, y FROM tbl");
    });

    it("select reserved words as column names", () => {
      expect(select("comment", "begin").sql()).toBe("SELECT comment, begin");
    });

    it("select with expression alias", () => {
      expect(select("SUM(x) AS y").sql()).toBe("SELECT SUM(x) AS y");
    });

    it("select number literal", () => {
      expect(select("1").from_("tbl").sql()).toBe("SELECT 1 FROM tbl");
    });
  });

  // =========================================================================
  // from_
  // =========================================================================
  describe("from_", () => {
    it("from replaces previous from", () => {
      expect(select("x").from_("tbl").from_("tbl2").sql()).toBe("SELECT x FROM tbl2");
    });

    it("from_ function creates select", () => {
      expect(from_("tbl").select("x").sql()).toBe("SELECT x FROM tbl");
    });

    it("select from subquery", () => {
      expect(
        select("x").from_(select("x").from_("tbl").subquery()).sql(),
      ).toBe("SELECT x FROM (SELECT x FROM tbl)");
    });
  });

  // =========================================================================
  // where
  // =========================================================================
  describe("where", () => {
    it("simple where", () => {
      expect(select("x").from_("tbl").where("x > 0").sql()).toBe(
        "SELECT x FROM tbl WHERE x > 0",
      );
    });

    it("where with OR", () => {
      expect(select("x").from_("tbl").where("x < 4 OR x > 5").sql()).toBe(
        "SELECT x FROM tbl WHERE x < 4 OR x > 5",
      );
    });

    it("chained where clauses produce AND", () => {
      expect(
        select("x").from_("tbl").where("x > 0").where("x < 9").sql(),
      ).toBe("SELECT x FROM tbl WHERE x > 0 AND x < 9");
    });

    it("where with append=false replaces previous where", () => {
      expect(
        select("x")
          .from_("tbl")
          .where("x > 0")
          .where("x < 9", { append: false })
          .sql(),
      ).toBe("SELECT x FROM tbl WHERE x < 9");
    });
  });

  // =========================================================================
  // group by
  // =========================================================================
  describe("group by", () => {
    it("simple group by", () => {
      expect(select("x", "y").from_("tbl").groupBy("x").sql()).toBe(
        "SELECT x, y FROM tbl GROUP BY x",
      );
    });

    it("group by with separate column args", () => {
      expect(select("x", "y").from_("tbl").groupBy("x", "y").sql()).toBe(
        "SELECT x, y FROM tbl GROUP BY x, y",
      );
    });

    it("chained group by calls", () => {
      expect(
        select("x", "y", "z", "a")
          .from_("tbl")
          .groupBy("x", "y", "z")
          .groupBy("a")
          .sql(),
      ).toBe("SELECT x, y, z, a FROM tbl GROUP BY x, y, z, a");
    });
  });

  // =========================================================================
  // having
  // =========================================================================
  describe("having", () => {
    it("having clause", () => {
      expect(
        select("x", "COUNT(y)").from_("tbl").groupBy("x").having("COUNT(y) > 0").sql(),
      ).toBe("SELECT x, COUNT(y) FROM tbl GROUP BY x HAVING COUNT(y) > 0");
    });
  });

  // =========================================================================
  // order by
  // =========================================================================
  describe("order by", () => {
    it("simple order by", () => {
      expect(select("x").from_("tbl").orderBy("y").sql()).toBe(
        "SELECT x FROM tbl ORDER BY y",
      );
    });

    it("order by single DESC using Ordered expression", () => {
      const orderedExpr = new Ordered({
        this: maybeParse("y"),
        desc: true,
      });
      expect(select("x").from_("tbl").orderBy(orderedExpr).sql()).toBe(
        "SELECT x FROM tbl ORDER BY y DESC",
      );
    });

    it("chained order by calls", () => {
      expect(
        select("x", "y", "z", "a")
          .from_("tbl")
          .orderBy("x", "y", "z")
          .orderBy("a")
          .sql(),
      ).toBe("SELECT x, y, z, a FROM tbl ORDER BY x, y, z, a");
    });
  });

  // =========================================================================
  // limit and offset
  // =========================================================================
  describe("limit and offset", () => {
    it("limit", () => {
      expect(select("x").from_("tbl").limit(10).sql()).toBe("SELECT x FROM tbl LIMIT 10");
    });

    it("offset", () => {
      expect(select("x").from_("tbl").offset(10).sql()).toBe(
        "SELECT x FROM tbl OFFSET 10",
      );
    });
  });

  // =========================================================================
  // join
  // =========================================================================
  describe("join", () => {
    it("join with on option", () => {
      expect(
        select("x").from_("tbl").join("tbl2", { on: "tbl.y = tbl2.y" }).sql(),
      ).toBe("SELECT x FROM tbl JOIN tbl2 ON tbl.y = tbl2.y");
    });

    it("join with joinType left outer", () => {
      expect(
        select("x").from_("tbl").join("tbl2", { joinType: "left outer" }).sql(),
      ).toBe("SELECT x FROM tbl LEFT OUTER JOIN tbl2");
    });

    it("join with Table expression and joinType", () => {
      expect(
        select("x")
          .from_("tbl")
          .join(new Table({ this: toIdentifier("tbl2") }), { joinType: "left outer" })
          .sql(),
      ).toBe("SELECT x FROM tbl LEFT OUTER JOIN tbl2");
    });

    it("join with subquery aliased via subquery()", () => {
      expect(
        select("x")
          .from_("tbl")
          .join(select("y").from_("tbl2").subquery("aliased"), {
            joinType: "left outer",
          })
          .sql(),
      ).toBe("SELECT x FROM tbl LEFT OUTER JOIN (SELECT y FROM tbl2) AS aliased");
    });

    it("join without on creates comma join", () => {
      expect(
        select("x").from_("tbl").join("tbl3").sql(),
      ).toBe("SELECT x FROM tbl, tbl3");
    });
  });

  // =========================================================================
  // subquery
  // =========================================================================
  describe("subquery", () => {
    it("subquery without alias", () => {
      expect(select("x").from_("tbl").subquery().sql()).toBe("(SELECT x FROM tbl)");
    });

    it("subquery with alias", () => {
      expect(select("x").from_("tbl").subquery("y").sql()).toBe(
        "(SELECT x FROM tbl) AS y",
      );
    });
  });

  // =========================================================================
  // and_ or_ not_
  // =========================================================================
  describe("and_ or_ not_", () => {
    it("and_ two conditions", () => {
      expect(and_("x=1", "y=1").sql()).toBe("x = 1 AND y = 1");
    });

    it("condition.and_", () => {
      expect(condition("x=1").and_("y=1").sql()).toBe("x = 1 AND y = 1");
    });

    it("and_ three conditions", () => {
      expect(and_("x=1", "y=1", "z=1").sql()).toBe("x = 1 AND y = 1 AND z = 1");
    });

    it("condition.and_ with two extra", () => {
      expect(condition("x=1").and_("y=1", "z=1").sql()).toBe(
        "x = 1 AND y = 1 AND z = 1",
      );
    });

    it("and_ with nested and_", () => {
      expect(and_("x=1", and_("y=1", "z=1")).sql()).toBe(
        "x = 1 AND (y = 1 AND z = 1)",
      );
    });

    it("chained condition.and_.and_", () => {
      expect(condition("x=1").and_("y=1").and_("z=1").sql()).toBe(
        "(x = 1 AND y = 1) AND z = 1",
      );
    });

    it("or_ with nested and_", () => {
      expect(or_(and_("x=1", "y=1"), "z=1").sql()).toBe(
        "(x = 1 AND y = 1) OR z = 1",
      );
    });

    it("condition.and_.or_", () => {
      expect(condition("x=1").and_("y=1").or_("z=1").sql()).toBe(
        "(x = 1 AND y = 1) OR z = 1",
      );
    });

    it("or_ reversed", () => {
      expect(or_("z=1", and_("x=1", "y=1")).sql()).toBe(
        "z = 1 OR (x = 1 AND y = 1)",
      );
    });

    it("or_ with complex left", () => {
      expect(or_("z=1 OR a=1", and_("x=1", "y=1")).sql()).toBe(
        "(z = 1 OR a = 1) OR (x = 1 AND y = 1)",
      );
    });

    it("not_", () => {
      expect(not_("x=1").sql()).toBe("NOT x = 1");
    });

    it("condition.not_", () => {
      expect(condition("x=1").not_().sql()).toBe("NOT x = 1");
    });

    it("condition.and_.not_", () => {
      expect(condition("x=1").and_("y=1").not_().sql()).toBe(
        "NOT (x = 1 AND y = 1)",
      );
    });

    it("where with condition builder", () => {
      expect(
        select("*").from_("x").where(condition("y=1").and_("z=1")).sql(),
      ).toBe("SELECT * FROM x WHERE y = 1 AND z = 1");
    });
  });

  // =========================================================================
  // condition expression operations
  // =========================================================================
  describe("condition expression operations", () => {
    it("condition parent is null after arithmetic", () => {
      const x = condition("x");
      // Build x + 1 to verify x's parent is not mutated
      const _xPlusOne = new Add({
        this: x.copy(),
        expression: maybeParse("1"),
      });
      expect(x.parent).toBeUndefined();
    });
  });

  // =========================================================================
  // as_ alias
  // =========================================================================
  describe("as_ alias", () => {
    it("expression as_ alias", () => {
      const x = condition("x");
      expect(x.as_("y").sql()).toBe("x AS y");
    });
  });

  // =========================================================================
  // column and toIdentifier
  // =========================================================================
  describe("column and toIdentifier", () => {
    it("column with table", () => {
      expect(column("x", "tbl").sql()).toBe("tbl.x");
    });

    it("column without table", () => {
      expect(column("x").sql()).toBe("x");
    });

    it("toIdentifier creates identifier", () => {
      const id = toIdentifier("foo");
      expect(id).toBeInstanceOf(Identifier);
      expect(id!.name).toBe("foo");
    });

    it("toColumn from dotted path", () => {
      const col = toColumn("tbl.x");
      expect(col).toBeInstanceOf(Column);
      expect(col.sql()).toBe("tbl.x");
    });
  });

  // =========================================================================
  // cast
  // =========================================================================
  describe("cast", () => {
    it("cast with different types wraps with additional cast", () => {
      expect(cast("CAST(x AS TEXT)", "int").sql()).toBe(
        "CAST(CAST(x AS TEXT) AS INT)",
      );
    });
  });

  // =========================================================================
  // case expression
  // =========================================================================
  describe("case expression", () => {
    it("case when else", () => {
      expect(
        new Case({})
          .when("x = 1", "x")
          .else_("bar")
          .sql(),
      ).toBe("CASE WHEN x = 1 THEN x ELSE bar END");
    });

    it("case with operand", () => {
      expect(
        new Case({ this: maybeParse("x") })
          .when("1", "x")
          .else_("bar")
          .sql(),
      ).toBe("CASE x WHEN 1 THEN x ELSE bar END");
    });
  });

  // =========================================================================
  // parseOne and chaining
  // =========================================================================
  describe("parseOne and chaining", () => {
    it("parseOne select and add column", () => {
      const expr = parseOne("SELECT a FROM tbl") as Select;
      expect(expr.select("b").sql()).toBe("SELECT a, b FROM tbl");
    });

    it("parsed select and add column via chaining", () => {
      const expr = parseOne("SELECT * FROM y") as Select;
      expect(expr.select("z").sql()).toBe("SELECT *, z FROM y");
    });
  });

  // =========================================================================
  // Null expression
  // =========================================================================
  describe("Null expression", () => {
    it("Null().sql()", () => {
      expect(new Null({}).sql()).toBe("NULL");
    });
  });

  // =========================================================================
  // Literal
  // =========================================================================
  describe("Literal", () => {
    it("Literal.number", () => {
      expect(Literal.number(42).sql()).toBe("42");
    });

    it("Literal.string", () => {
      expect(Literal.string("hello").sql()).toBe("'hello'");
    });
  });

  // =========================================================================
  // Expression types and properties
  // =========================================================================
  describe("Expression types and properties", () => {
    it("Select instance check", () => {
      const s = select("x");
      expect(s).toBeInstanceOf(Select);
    });

    it("Column is created by column()", () => {
      const c = column("x");
      expect(c).toBeInstanceOf(Column);
      expect(c.name).toBe("x");
    });

    it("Column with db and catalog", () => {
      const c = column("x", "tbl", "db", "cat");
      expect(c.sql()).toBe("cat.db.tbl.x");
    });

    it("toColumn with 3-part path", () => {
      const c = toColumn("db.tbl.x");
      expect(c).toBeInstanceOf(Column);
      expect(c.sql()).toBe("db.tbl.x");
    });

    it("toIdentifier with quoted=true", () => {
      const id = toIdentifier("foo", true);
      expect(id!.quoted).toBe(true);
    });

    it("toIdentifier with space in name auto-quotes", () => {
      const id = toIdentifier("my col");
      expect(id!.quoted).toBe(true);
    });

    it("toIdentifier with safe name does not quote", () => {
      const id = toIdentifier("foo_bar");
      expect(id!.quoted).toBe(false);
    });

    it("Literal.number with 0", () => {
      expect(Literal.number(0).sql()).toBe("0");
    });

    it("Literal.string with empty string", () => {
      expect(Literal.string("").sql()).toBe("''");
    });

    it("null_ function", () => {
      expect(null_().sql()).toBe("NULL");
    });

    it("Boolean_ true", () => {
      expect(new Boolean_({ this: true }).sql()).toBe("TRUE");
    });

    it("Boolean_ false", () => {
      expect(new Boolean_({ this: false }).sql()).toBe("FALSE");
    });

    it("Star expression", () => {
      expect(new Star({}).sql()).toBe("*");
    });
  });

  // =========================================================================
  // method chaining combinations
  // =========================================================================
  describe("method chaining combinations", () => {
    it("select from where group by having order by limit offset", () => {
      expect(
        select("x", "COUNT(y)")
          .from_("tbl")
          .where("x > 0")
          .groupBy("x")
          .having("COUNT(y) > 1")
          .orderBy("x")
          .limit(10)
          .offset(5)
          .sql(),
      ).toBe(
        "SELECT x, COUNT(y) FROM tbl WHERE x > 0 GROUP BY x HAVING COUNT(y) > 1 ORDER BY x LIMIT 10 OFFSET 5",
      );
    });

    it("multiple joins", () => {
      expect(
        select("x")
          .from_("t1")
          .join("t2", { on: "t1.id = t2.id" })
          .join("t3", { on: "t1.id = t3.id", joinType: "left" })
          .sql(),
      ).toBe(
        "SELECT x FROM t1 JOIN t2 ON t1.id = t2.id LEFT JOIN t3 ON t1.id = t3.id",
      );
    });

    it("select from with join and where", () => {
      expect(
        select("a", "b")
          .from_("t1")
          .join("t2", { on: "t1.id = t2.id", joinType: "inner" })
          .where("a > 0")
          .sql(),
      ).toBe("SELECT a, b FROM t1 INNER JOIN t2 ON t1.id = t2.id WHERE a > 0");
    });

    it("order by ASC using Ordered expression", () => {
      const orderedExpr = new Ordered({
        this: maybeParse("y"),
        desc: false,
      });
      expect(select("x").from_("tbl").orderBy(orderedExpr).sql()).toBe(
        "SELECT x FROM tbl ORDER BY y ASC",
      );
    });

    it("order by NULLS FIRST using Ordered expression", () => {
      const orderedExpr = new Ordered({
        this: maybeParse("y"),
        desc: true,
        nulls_first: true,
      });
      expect(select("x").from_("tbl").orderBy(orderedExpr).sql()).toBe(
        "SELECT x FROM tbl ORDER BY y DESC NULLS FIRST",
      );
    });
  });

  // =========================================================================
  // cast additional tests
  // =========================================================================
  describe("cast additional", () => {
    it("cast simple expression", () => {
      expect(cast("x", "INT").sql()).toBe("CAST(x AS INT)");
    });

    it("cast to VARCHAR", () => {
      expect(cast("x", "VARCHAR").sql()).toBe("CAST(x AS VARCHAR)");
    });
  });

  // =========================================================================
  // complex condition building
  // =========================================================================
  describe("complex condition building", () => {
    it("deeply nested and/or conditions", () => {
      expect(
        and_(or_("a=1", "b=2"), or_("c=3", "d=4")).sql(),
      ).toBe("(a = 1 OR b = 2) AND (c = 3 OR d = 4)");
    });

    it("nested or within and", () => {
      expect(
        and_(or_("a=1", "b=2"), or_("c=3", "d=4")).not_().sql(),
      ).toBe("NOT ((a = 1 OR b = 2) AND (c = 3 OR d = 4))");
    });
  });

  // =========================================================================
  // parseOne based tests
  // =========================================================================
  describe("parseOne based tests", () => {
    it("parse and regenerate complex query", () => {
      const sql = "SELECT a, b FROM t1 JOIN t2 ON t1.id = t2.id WHERE a > 1 ORDER BY b";
      expect(parseOne(sql).sql()).toBe(sql);
    });

    it("parse and add where to parsed query", () => {
      const expr = parseOne("SELECT x FROM tbl") as Select;
      expect(expr.where("x > 0").sql()).toBe("SELECT x FROM tbl WHERE x > 0");
    });

    it("parse and add having to parsed query", () => {
      const expr = parseOne("SELECT x, COUNT(y) FROM tbl GROUP BY x") as Select;
      expect(expr.having("COUNT(y) > 0").sql()).toBe(
        "SELECT x, COUNT(y) FROM tbl GROUP BY x HAVING COUNT(y) > 0",
      );
    });

    it("parse and add limit to parsed query", () => {
      const expr = parseOne("SELECT x FROM tbl") as Select;
      expect(expr.limit(10).sql()).toBe("SELECT x FROM tbl LIMIT 10");
    });

    it("parse and add offset to parsed query", () => {
      const expr = parseOne("SELECT x FROM tbl") as Select;
      expect(expr.offset(5).sql()).toBe("SELECT x FROM tbl OFFSET 5");
    });
  });

  // =========================================================================
  // Tests for features not yet ported (using it.todo)
  // =========================================================================
  describe("features not yet ported", () => {
    // select builder features
    it.todo("select with append=false replaces expressions");
    it.todo("where with None filters correctly");
    it.todo("where with False and empty string");
    it.todo("where with multiple varargs (Python: .where('x > 0', 'x < 9'))");

    // dialect-specific
    it.todo("lock for update (mysql)");
    it.todo("lock for share (postgres)");
    it.todo("hint (spark)");
    it.todo("cluster_by / sort_by (hive)");
    it.todo("scalar CTE (clickhouse)");

    // group by / order by with comma-separated strings
    it.todo("group by with comma-separated string like 'x, y'");
    it.todo("order by with comma-separated string like 'x, y DESC'");
    it.todo("group by with cube");

    // distinct
    it.todo("distinct on (a, b)");
    it.todo("distinct true/false");

    // lateral
    it.todo("lateral view");

    // join features
    it.todo("join with ON in string (tbl2 ON tbl.y = tbl2.y)");
    it.todo("join with on as array of conditions");
    it.todo("join with Table expression and join_alias");
    it.todo("join with subquery and join_alias option");
    it.todo("join with Select expression directly (no subquery wrapper)");
    it.todo("join with left join string parsing");
    it.todo("join with select subquery string and joinType");
    it.todo("join with using option");
    it.todo("join using string");
    it.todo("Join.on() method");
    it.todo("Join.using() method");

    // CTE (with_)
    it.todo("with_ CTE");
    it.todo("with_ materialized");
    it.todo("with_ not materialized");
    it.todo("with_ recursive");
    it.todo("with_ with column aliases");
    it.todo("with_ chained multiple CTEs");
    it.todo("with_ combined with select, group_by, order_by, limit, offset, join, distinct, where, having");

    // CTAS
    it.todo("ctas");

    // set operations
    it.todo("union / intersect / except_ functions");
    it.todo("union / intersect / except_ methods on Select");
    it.todo("order by on union (SetOperation.orderBy)");
    it.todo("limit/offset on union (SetOperation.limit/offset)");

    // alias
    it.todo("alias function for window expressions");

    // DML builders
    it.todo("exp.values");
    it.todo("exp.delete");
    it.todo("exp.insert");
    it.todo("exp.update");
    it.todo("exp.merge");
    it.todo("exp.rename_column");

    // window / qualify
    it.todo("window clause builder");
    it.todo("qualify clause builder");

    // exp helpers
    it.todo("exp.subquery builder");
    it.todo("exp.func builder");
    it.todo("exp.column.desc()");

    // operator overloads (not available in TS)
    it.todo("operator overloads (x + 1, x - 1, x * 1, etc.)");
    it.todo("comparison operators (x < 1, x > 1, etc.)");
    it.todo("eq / neq methods on condition");
    it.todo("is_ method for IS NULL");
    it.todo("isin method");
    it.todo("between method");
    it.todo("like / ilike / rlike methods");
    it.todo("bracket indexing (x[1])");
    it.todo("negation (-x)");
    it.todo("bitwise not (~x)");

    // cast dedup
    it.todo("cast already-cast expression avoids double cast when types match");

    // misc
    it.todo("exp.convert / tuple IN");
  });
});
