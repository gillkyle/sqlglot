/**
 * Trino dialect for sqlglot-ts.
 *
 * Trino is essentially Presto with minor differences. This separate file
 * matches the Python codebase structure and allows future Trino-specific overrides.
 */

import { Dialect } from "./dialect.js";
import { Presto } from "./presto.js";

// ---------------------------------------------------------------------------
// Trino Dialect
// ---------------------------------------------------------------------------

export class Trino extends Presto {}

// Register the dialect
Dialect.register(["trino"], Trino);
