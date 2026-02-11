/**
 * Hive dialect for sqlglot-ts.
 *
 * Apache Hive uses backtick (`) for identifier quoting, single or double
 * quotes for strings, backslash for string escapes, and maps standard SQL
 * types to Hive-compatible types: STRING, BINARY, BOOLEAN, TIMESTAMP, etc.
 *
 * Hive does NOT support ILIKE natively, so it is converted to LIKE.
 *
 * Function names are normalized to uppercase (default behavior).
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Hive Tokenizer
// ---------------------------------------------------------------------------

class HiveTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ["`"];
  static override QUOTES: Array<string | [string, string]> = ["'", '"'];
  static override STRING_ESCAPES: string[] = ["\\"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    ["/*", "*/"],
  ];

  static override KEYWORDS: Record<string, TokenType> = {
    ...Tokenizer.KEYWORDS,
    STRING: TokenType.TEXT,
  };
}

// ---------------------------------------------------------------------------
// Hive Generator
// ---------------------------------------------------------------------------

class HiveGenerator extends Generator {
  /**
   * Type mapping for Hive-compatible type names.
   *
   * Maps standard SQL types to Hive equivalents. Based on the Python
   * Hive dialect's Generator.TYPE_MAPPING.
   */
  private static TYPE_MAP: Record<string, string> = {
    BIT: "BOOLEAN",
    BLOB: "BINARY",
    DATETIME: "TIMESTAMP",
    TEXT: "STRING",
    TIME: "TIMESTAMP",
    TIMESTAMPNTZ: "TIMESTAMP",
    VARBINARY: "BINARY",
    VARCHAR: "STRING",
    CHAR: "STRING",
    NCHAR: "STRING",
    NVARCHAR: "STRING",
  };

  /**
   * Function name mapping for Hive-specific function renames.
   * Maps generic/other-dialect function names to Hive equivalents.
   */
  private static FUNCTION_NAME_MAP: Record<string, string> = {
    APPROX_PERCENTILE: "PERCENTILE_APPROX",
    APPROX_QUANTILE: "PERCENTILE_APPROX",
    ARRAY_AGG: "COLLECT_LIST",
    SET_AGG: "COLLECT_SET",
    ARRAY_UNIQUE_AGG: "COLLECT_SET",
    LIST_HAS: "ARRAY_CONTAINS",
    VAR_MAP: "MAP",
    TRY_CAST: "CAST",
    LOG: "LN",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = HiveGenerator.TYPE_MAP[typeValue] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }

  override anonymousSql(expression: Expression): string {
    const name = expression.this_ as string;
    const upper = (name || "").toUpperCase();

    // DATE_SUB(a, b) -> DATE_ADD(a, b * -1)
    // DATE_SUB(a, b, unit) -> ADD_MONTHS(a, b * -1) when unit is month
    if (upper === "DATE_SUB") {
      const args = expression.expressions || [];
      if (args.length >= 3) {
        const unitArg = args[2];
        const unitStr = this.sql(unitArg).toUpperCase();
        if (unitStr === "MONTH" || unitStr === "month") {
          const negated = this._negateArg(args[1]);
          return this.func("ADD_MONTHS", args[0], negated);
        }
      }
      if (args.length >= 2) {
        const negated = this._negateArg(args[1]);
        return this.func("DATE_ADD", args[0], negated);
      }
    }

    const mapped = HiveGenerator.FUNCTION_NAME_MAP[upper];
    if (mapped) {
      return this.func(mapped, ...(expression.expressions || []));
    }
    return this.func(
      this.sql(expression, "this"),
      ...(expression.expressions || []),
    );
  }

  /**
   * Negate an argument by wrapping with `expr * -1`.
   * Parenthesizes compound expressions to maintain correct precedence.
   */
  private _negateArg(arg: any): string {
    const argSql = this.sql(arg);
    // Compound expressions (containing spaces/operators) need parentheses
    if (argSql.includes(" ")) {
      return `(${argSql}) * -1`;
    }
    return `${argSql} * -1`;
  }

  /**
   * Hive does not support TRY_CAST. Convert to CAST.
   */
  override trycastSql(expression: Expression): string {
    return this.castSql(expression);
  }

  /**
   * Hive requires ON clause for non-CROSS joins. Add ON TRUE if missing.
   * Also convert comma joins to CROSS JOIN.
   */
  override joinSql(expression: Expression): string {
    const method = expression.text("method").toUpperCase();
    const side = expression.text("side").toUpperCase();
    const kind = expression.text("kind").toUpperCase();

    const opParts = [method, side, kind].filter(Boolean);
    let opSql = opParts.join(" ");

    const thisSql = this.sql(expression, "this");
    const on = this.sql(expression, "on");
    const using = expression.args.using as Expression[] | undefined;

    let onSql: string;
    if (on) {
      onSql = ` ON ${on}`;
    } else if (using && using.length > 0) {
      const usingCols = using.map((c: any) => this.sql(c)).join(", ");
      onSql = ` USING (${usingCols})`;
    } else if (!opSql) {
      // Comma join -> CROSS JOIN
      return `${this.seg("CROSS JOIN")} ${thisSql}`;
    } else if (kind === "CROSS") {
      onSql = "";
    } else {
      // Hive requires ON clause for non-CROSS joins
      onSql = " ON TRUE";
    }

    opSql = opSql ? `${opSql} JOIN` : "JOIN";
    return `${this.seg(opSql)} ${thisSql}${onSql}`;
  }

  /**
   * Hive does not support ILIKE. Convert to LIKE.
   */
  override ilikeSql(expression: Expression): string {
    return this.binary(expression, "LIKE");
  }
}

// ---------------------------------------------------------------------------
// Hive Dialect
// ---------------------------------------------------------------------------

export class Hive extends Dialect {
  static override IDENTIFIER_START = "`";
  static override IDENTIFIER_END = "`";
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";

  static override TokenizerClass: any = HiveTokenizer;
  static override GeneratorClass: typeof Generator = HiveGenerator;
}

// Register the dialect
Dialect.register(["hive"], Hive);
