import { describe, it, expect } from "vitest";
import {
  camelToSnakeCase,
  seqGet,
  ensureList,
  ensureCollection,
  csv,
  splitNumWords,
  isInt,
  isFloat,
  nameSequence,
  findNewName,
  whileChanging,
  isBool,
  toBool,
  flatten,
  dictDepth,
  first,
  mergeRanges,
} from "../src/helper.js";

describe("helper", () => {
  describe("camelToSnakeCase", () => {
    it("converts camelCase to UPPER_SNAKE_CASE", () => {
      expect(camelToSnakeCase("camelCase")).toBe("CAMEL_CASE");
    });

    it("converts PascalCase to UPPER_SNAKE_CASE", () => {
      expect(camelToSnakeCase("PascalCase")).toBe("PASCAL_CASE");
    });

    it("handles single word", () => {
      expect(camelToSnakeCase("hello")).toBe("HELLO");
    });

    it("handles already uppercase", () => {
      expect(camelToSnakeCase("ABC")).toBe("A_B_C");
    });

    it("handles empty string", () => {
      expect(camelToSnakeCase("")).toBe("");
    });
  });

  describe("seqGet", () => {
    it("returns element at valid index", () => {
      expect(seqGet([1, 2, 3], 0)).toBe(1);
      expect(seqGet([1, 2, 3], 1)).toBe(2);
      expect(seqGet([1, 2, 3], 2)).toBe(3);
    });

    it("returns null for out of bounds index", () => {
      expect(seqGet([1, 2, 3], 3)).toBeNull();
      expect(seqGet([1, 2, 3], 10)).toBeNull();
    });

    it("supports negative indexing", () => {
      expect(seqGet([1, 2, 3], -1)).toBe(3);
      expect(seqGet([1, 2, 3], -2)).toBe(2);
      expect(seqGet([1, 2, 3], -3)).toBe(1);
    });

    it("returns null for negative index out of bounds", () => {
      expect(seqGet([1, 2, 3], -4)).toBeNull();
    });

    it("returns null for empty array", () => {
      expect(seqGet([], 0)).toBeNull();
    });
  });

  describe("ensureList", () => {
    it("wraps a single value in an array", () => {
      expect(ensureList(1)).toEqual([1]);
      expect(ensureList("hello")).toEqual(["hello"]);
    });

    it("returns a copy of an array", () => {
      const arr = [1, 2, 3];
      const result = ensureList(arr);
      expect(result).toEqual([1, 2, 3]);
      expect(result).not.toBe(arr);
    });

    it("returns empty array for null", () => {
      expect(ensureList(null)).toEqual([]);
    });

    it("returns empty array for undefined", () => {
      expect(ensureList(undefined)).toEqual([]);
    });
  });

  describe("ensureCollection", () => {
    it("wraps a single value in an array", () => {
      expect([...ensureCollection(1)]).toEqual([1]);
    });

    it("returns an iterable for an array", () => {
      expect([...ensureCollection([1, 2, 3])]).toEqual([1, 2, 3]);
    });

    it("returns empty array for null", () => {
      expect([...ensureCollection(null)]).toEqual([]);
    });

    it("returns empty array for undefined", () => {
      expect([...ensureCollection(undefined)]).toEqual([]);
    });

    it("wraps a string as a single element", () => {
      expect([...ensureCollection("hello")]).toEqual(["hello"]);
    });
  });

  describe("csv", () => {
    it("joins strings with comma separator", () => {
      expect(csv("a", "b", "c")).toBe("a, b, c");
    });

    it("filters out empty strings", () => {
      expect(csv("a", "", "c")).toBe("a, c");
    });

    it("returns empty string for no args", () => {
      expect(csv()).toBe("");
    });

    it("returns single value as-is", () => {
      expect(csv("a")).toBe("a");
    });
  });

  describe("splitNumWords", () => {
    it("splits and pads from start by default", () => {
      expect(splitNumWords("a.b.c", ".", 3)).toEqual(["a", "b", "c"]);
    });

    it("pads with null from start when too few words", () => {
      expect(splitNumWords("b.c", ".", 3)).toEqual([null, "b", "c"]);
    });

    it("pads with null from end when fillFromStart is false", () => {
      expect(splitNumWords("b.c", ".", 3, false)).toEqual(["b", "c", null]);
    });

    it("handles single word with padding", () => {
      expect(splitNumWords("a", ".", 3)).toEqual([null, null, "a"]);
    });

    it("handles exact match of words", () => {
      expect(splitNumWords("a.b", ".", 2)).toEqual(["a", "b"]);
    });

    it("handles more words than minNumWords", () => {
      expect(splitNumWords("a.b.c.d", ".", 2)).toEqual(["a", "b", "c", "d"]);
    });
  });

  describe("isInt", () => {
    it("returns true for integer strings", () => {
      expect(isInt("0")).toBe(true);
      expect(isInt("1")).toBe(true);
      expect(isInt("123")).toBe(true);
      expect(isInt("-1")).toBe(true);
      expect(isInt("-123")).toBe(true);
    });

    it("returns false for non-integer strings", () => {
      expect(isInt("1.0")).toBe(false);
      expect(isInt("abc")).toBe(false);
      expect(isInt("")).toBe(false);
      expect(isInt("1.5")).toBe(false);
    });

    it("handles whitespace", () => {
      expect(isInt(" 1 ")).toBe(true);
    });
  });

  describe("isFloat", () => {
    it("returns true for float strings", () => {
      expect(isFloat("1.0")).toBe(true);
      expect(isFloat("1.5")).toBe(true);
      expect(isFloat("-1.5")).toBe(true);
    });

    it("returns true for integer strings (they are valid floats)", () => {
      expect(isFloat("1")).toBe(true);
      expect(isFloat("0")).toBe(true);
    });

    it("returns false for non-numeric strings", () => {
      expect(isFloat("abc")).toBe(false);
      expect(isFloat("")).toBe(false);
    });
  });

  describe("nameSequence", () => {
    it("generates sequential names with prefix", () => {
      const s1 = nameSequence("a");
      const s2 = nameSequence("b");

      expect(s1()).toBe("a0");
      expect(s1()).toBe("a1");
      expect(s2()).toBe("b0");
      expect(s1()).toBe("a2");
      expect(s2()).toBe("b1");
      expect(s2()).toBe("b2");
    });
  });

  describe("findNewName", () => {
    it("returns base name if not taken", () => {
      expect(findNewName(new Set(["a", "b"]), "c")).toBe("c");
    });

    it("appends _2 if base name is taken", () => {
      expect(findNewName(new Set(["a", "b"]), "a")).toBe("a_2");
    });

    it("increments suffix if _2 is also taken", () => {
      expect(findNewName(new Set(["a", "a_2"]), "a")).toBe("a_3");
    });

    it("works with an array as taken", () => {
      expect(findNewName(["a", "b"], "a")).toBe("a_2");
    });

    it("works with empty taken set", () => {
      expect(findNewName(new Set(), "a")).toBe("a");
    });
  });

  describe("whileChanging", () => {
    it("applies function until result stops changing", () => {
      let value = 0;
      const result = whileChanging(
        value,
        (v) => {
          value = Math.min(v + 1, 5);
          return value;
        },
        (v) => v,
      );
      expect(result).toBe(5);
    });

    it("returns immediately if no change", () => {
      const result = whileChanging(
        10,
        (v) => v,
        (v) => v,
      );
      expect(result).toBe(10);
    });
  });

  describe("isBool", () => {
    it("returns true for boolean values", () => {
      expect(isBool(true)).toBe(true);
      expect(isBool(false)).toBe(true);
    });

    it("returns false for non-boolean values", () => {
      expect(isBool(1)).toBe(false);
      expect(isBool("true")).toBe(false);
      expect(isBool(null)).toBe(false);
      expect(isBool(undefined)).toBe(false);
    });
  });

  describe("toBool", () => {
    it("converts 'true' string to boolean true", () => {
      expect(toBool("true")).toBe(true);
      expect(toBool("True")).toBe(true);
      expect(toBool("TRUE")).toBe(true);
    });

    it("converts 'false' string to boolean false", () => {
      expect(toBool("false")).toBe(false);
      expect(toBool("False")).toBe(false);
      expect(toBool("FALSE")).toBe(false);
    });

    it("converts '1' to true and '0' to false", () => {
      expect(toBool("1")).toBe(true);
      expect(toBool("0")).toBe(false);
    });

    it("passes through boolean values", () => {
      expect(toBool(true)).toBe(true);
      expect(toBool(false)).toBe(false);
    });

    it("passes through null and undefined", () => {
      expect(toBool(null)).toBeNull();
      expect(toBool(undefined)).toBeUndefined();
    });

    it("returns original string for unrecognized values", () => {
      expect(toBool("hello")).toBe("hello");
    });
  });

  describe("flatten", () => {
    it("flattens nested arrays", () => {
      expect(flatten([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]);
    });

    it("flattens deeply nested arrays", () => {
      expect(flatten([1, [2, [3, [4]]]])).toEqual([1, 2, 3, 4]);
    });

    it("returns flat array unchanged", () => {
      expect(flatten([1, 2, 3])).toEqual([1, 2, 3]);
    });

    it("handles empty array", () => {
      expect(flatten([])).toEqual([]);
    });

    it("does not flatten strings", () => {
      expect(flatten(["abc", "def"])).toEqual(["abc", "def"]);
    });
  });

  describe("dictDepth", () => {
    it("returns 0 for non-object values", () => {
      expect(dictDepth(null)).toBe(0);
      expect(dictDepth(undefined)).toBe(0);
      expect(dictDepth(1)).toBe(0);
      expect(dictDepth("hello")).toBe(0);
    });

    it("returns 1 for empty object", () => {
      expect(dictDepth({})).toBe(1);
    });

    it("returns correct depth for nested objects", () => {
      expect(dictDepth({ a: 1 })).toBe(1);
      expect(dictDepth({ a: { b: 1 } })).toBe(2);
      expect(dictDepth({ a: { b: { c: 1 } } })).toBe(3);
    });
  });

  describe("first", () => {
    it("returns first element of an array", () => {
      expect(first([1, 2, 3])).toBe(1);
    });

    it("returns first element of a set", () => {
      const s = new Set([42]);
      expect(first(s)).toBe(42);
    });

    it("throws for empty iterable", () => {
      expect(() => first([])).toThrow("Empty iterable");
    });
  });

  describe("mergeRanges", () => {
    it("returns empty array for empty input", () => {
      expect(mergeRanges([])).toEqual([]);
    });

    it("returns single range unchanged", () => {
      expect(mergeRanges([[0, 1]])).toEqual([[0, 1]]);
    });

    it("does not merge non-overlapping ranges", () => {
      expect(mergeRanges([[0, 1], [2, 3]])).toEqual([[0, 1], [2, 3]]);
    });

    it("merges overlapping ranges", () => {
      expect(mergeRanges([[0, 1], [1, 3]])).toEqual([[0, 3]]);
    });

    it("sorts and merges out-of-order ranges", () => {
      expect(mergeRanges([[2, 3], [0, 1], [3, 4]])).toEqual([[0, 1], [2, 4]]);
    });
  });
});
