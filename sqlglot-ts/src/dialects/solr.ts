/**
 * Apache Solr dialect for sqlglot-ts.
 *
 * Solr uses double-quote (") for identifier quoting, single-quote for strings,
 * and has minimal type mappings. TEXT is mapped to VARCHAR.
 *
 * https://solr.apache.org/guide/solr/latest/query-guide/sql-query.html
 *
 * Function names are normalized to uppercase (default behavior).
 */

import { Dialect } from "./dialect.js";
import { Tokenizer } from "../tokenizer.js";
import { Generator } from "../generator.js";
import { TokenType } from "../tokens.js";
import type { Expression } from "../expressions.js";

// ---------------------------------------------------------------------------
// Solr Tokenizer
// ---------------------------------------------------------------------------

class SolrTokenizer extends Tokenizer {
  static override IDENTIFIERS: Array<string | [string, string]> = ['"'];
  static override QUOTES: Array<string | [string, string]> = ["'"];
  static override STRING_ESCAPES: string[] = ["'"];
  static override COMMENTS: Array<string | [string, string]> = [
    "--",
    ["/*", "*/"],
  ];
}

// ---------------------------------------------------------------------------
// Solr Generator
// ---------------------------------------------------------------------------

class SolrGenerator extends Generator {
  /**
   * Type mapping for Solr-compatible type names.
   *
   * Solr has a very limited SQL interface. TEXT is mapped to VARCHAR.
   * Most other types are kept as-is.
   */
  private static TYPE_MAP: Record<string, string> = {
    TEXT: "VARCHAR",
  };

  override datatypeSql(expression: Expression): string {
    const typeValue = expression.this_;
    let typeSql: string;

    if (typeof typeValue === "string") {
      typeSql = SolrGenerator.TYPE_MAP[typeValue] ?? typeValue;
    } else {
      typeSql = String(typeValue ?? "");
    }

    const interior = this.expressions(expression, { flat: true });
    if (interior) {
      return `${typeSql}(${interior})`;
    }
    return typeSql;
  }
}

// ---------------------------------------------------------------------------
// Solr Dialect
// ---------------------------------------------------------------------------

export class Solr extends Dialect {
  static override IDENTIFIER_START = '"';
  static override IDENTIFIER_END = '"';
  static override QUOTE_START = "'";
  static override QUOTE_END = "'";

  static override TokenizerClass: any = SolrTokenizer;
  static override GeneratorClass: typeof Generator = SolrGenerator;
}

// Register the dialect
Dialect.register(["solr"], Solr);
