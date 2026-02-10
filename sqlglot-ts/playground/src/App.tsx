import { useState, useEffect, useRef, useCallback } from "react";
import { Dialect, type Expression } from "sqlglot-ts";
import SqlEditor from "./components/SqlEditor";
import DialectSelector from "./components/DialectSelector";
import TranspileOutput from "./components/TranspileOutput";
import AstViewer from "./components/AstViewer";
import QueryResults from "./components/QueryResults";

const DEFAULT_SQL = `SELECT users.name, orders.total
FROM users
JOIN orders ON users.id = orders.user_id
WHERE orders.total > 100
ORDER BY orders.total DESC`;

interface Preset {
  label: string;
  description: string;
  category: string;
  sql: string;
  read: string;
  write: string;
}

const PRESETS: Preset[] = [
  // ── Basics ──
  {
    label: "Identifier Quoting",
    category: "Basics",
    description: "MySQL backticks become Postgres double-quotes",
    read: "mysql",
    write: "postgres",
    sql: `SELECT \`users\`.\`name\`, \`orders\`.\`total\`
FROM \`users\`
JOIN \`orders\` ON \`users\`.\`id\` = \`orders\`.\`user_id\`
WHERE \`orders\`.\`total\` > 100`,
  },
  {
    label: "Type Mappings",
    category: "Basics",
    description: "MySQL types map to Postgres equivalents",
    read: "mysql",
    write: "postgres",
    sql: `SELECT
  CAST(x AS SIGNED),
  CAST(y AS FLOAT),
  CAST(z AS DOUBLE),
  CAST(b AS BINARY),
  CAST(d AS DATETIME)`,
  },
  {
    label: "ILIKE Handling",
    category: "Basics",
    description: "Postgres ILIKE becomes MySQL LIKE (no ILIKE in MySQL)",
    read: "postgres",
    write: "mysql",
    sql: `SELECT name, email
FROM users
WHERE name ILIKE '%alice%'
   OR email ILIKE '%example%'`,
  },
  {
    label: "NULL Handling",
    category: "Basics",
    description: "IS NULL, IS NOT NULL, COALESCE, and NULLIF",
    read: "sqlglot",
    write: "postgres",
    sql: `SELECT
  name,
  COALESCE(email, 'no email') AS email,
  NULLIF(status, 'pending') AS active_status
FROM users
LEFT JOIN orders ON users.id = orders.user_id
WHERE orders.id IS NOT NULL
   OR users.email IS NULL`,
  },

  // ── Advanced Patterns ──
  {
    label: "Window Functions",
    category: "Advanced Patterns",
    description: "SUM() OVER with PARTITION BY and ORDER BY across dialects",
    read: "mysql",
    write: "postgres",
    sql: `SELECT
  \`user_id\`,
  \`total\`,
  SUM(\`total\`) OVER (PARTITION BY \`user_id\` ORDER BY \`created_at\`) AS \`running_total\`,
  ROW_NUMBER() OVER (PARTITION BY \`user_id\` ORDER BY \`total\` DESC) AS \`rank\`
FROM \`orders\``,
  },
  {
    label: "Chained CTEs",
    category: "Advanced Patterns",
    description: "Two CTEs where the second references the first",
    read: "mysql",
    write: "postgres",
    sql: `WITH \`order_totals\` AS (
  SELECT \`user_id\`, SUM(\`total\`) AS \`spent\`
  FROM \`orders\`
  GROUP BY \`user_id\`
),
\`ranked\` AS (
  SELECT \`user_id\`, \`spent\`,
    RANK() OVER (ORDER BY \`spent\` DESC) AS \`rnk\`
  FROM \`order_totals\`
)
SELECT \`u\`.\`name\`, \`r\`.\`spent\`, \`r\`.\`rnk\`
FROM \`ranked\` AS \`r\`
JOIN \`users\` AS \`u\` ON \`r\`.\`user_id\` = \`u\`.\`id\`
WHERE \`r\`.\`rnk\` <= 10`,
  },
  {
    label: "Correlated Subquery",
    category: "Advanced Patterns",
    description: "Subquery in SELECT that references the outer table",
    read: "sqlglot",
    write: "postgres",
    sql: `SELECT
  u.name,
  (SELECT MAX(o.total) FROM orders AS o WHERE o.user_id = u.id) AS max_order,
  (SELECT COUNT(*) FROM orders AS o WHERE o.user_id = u.id) AS order_count
FROM users AS u
WHERE u.id IN (SELECT user_id FROM orders)`,
  },
  {
    label: "CASE Inside Aggregates",
    category: "Advanced Patterns",
    description: "SUM(CASE WHEN ...) for conditional aggregation",
    read: "mysql",
    write: "postgres",
    sql: `SELECT
  \`u\`.\`name\`,
  SUM(CASE WHEN \`o\`.\`status\` = 'completed' THEN 1 ELSE 0 END) AS \`completed\`,
  SUM(CASE WHEN \`o\`.\`status\` = 'pending' THEN 1 ELSE 0 END) AS \`pending\`,
  SUM(CASE WHEN \`o\`.\`status\` = 'cancelled' THEN \`o\`.\`total\` ELSE 0 END) AS \`lost_revenue\`
FROM \`users\` AS \`u\`
JOIN \`orders\` AS \`o\` ON \`u\`.\`id\` = \`o\`.\`user_id\`
GROUP BY \`u\`.\`name\``,
  },

  // ── Cross-Dialect ──
  {
    label: "SingleStore :> Cast",
    category: "Cross-Dialect",
    description: "Standard CAST(x AS INT) becomes SingleStore's x :> INT operator",
    read: "postgres",
    write: "singlestore",
    sql: `SELECT
  CAST(price AS INT),
  CAST(name AS TEXT),
  CAST(created_at AS DATE)
FROM products`,
  },
  {
    label: "BigQuery Type System",
    category: "Cross-Dialect",
    description: "INT→INT64, FLOAT→FLOAT64, and backtick identifiers for BigQuery",
    read: "sqlglot",
    write: "bigquery",
    sql: `SELECT
  CAST(x AS INT),
  CAST(y AS FLOAT),
  CAST(z AS TEXT)
FROM my_project.my_dataset.my_table
WHERE id > 100`,
  },
  {
    label: "Snowflake Identifiers",
    category: "Cross-Dialect",
    description: "MySQL backticks become Snowflake double-quoted identifiers",
    read: "mysql",
    write: "snowflake",
    sql: `SELECT \`users\`.\`name\`, \`orders\`.\`total\`
FROM \`my_db\`.\`my_schema\`.\`users\`
JOIN \`orders\` ON \`users\`.\`id\` = \`orders\`.\`user_id\`
WHERE \`orders\`.\`total\` > 100
ORDER BY \`orders\`.\`total\` DESC`,
  },

  // ── Runnable (PGlite) ──
  {
    label: "Runnable Query",
    category: "Runnable (PGlite)",
    description: "Try it! Click Run to execute against PGlite",
    read: "sqlglot",
    write: "postgres",
    sql: `SELECT
  users.name,
  COUNT(*) AS order_count,
  SUM(orders.total) AS total_spent
FROM users
JOIN orders ON users.id = orders.user_id
WHERE orders.status = 'completed'
GROUP BY users.name
HAVING SUM(orders.total) > 100
ORDER BY total_spent DESC`,
  },
  {
    label: "JOINs & Subqueries",
    category: "Runnable (PGlite)",
    description: "Complex joins and subqueries transpile across dialects",
    read: "mysql",
    write: "postgres",
    sql: `SELECT \`u\`.\`name\`, \`o\`.\`total\`
FROM \`users\` AS \`u\`
LEFT JOIN \`orders\` AS \`o\`
  ON \`u\`.\`id\` = \`o\`.\`user_id\`
WHERE \`u\`.\`id\` IN (
  SELECT \`user_id\` FROM \`orders\`
  WHERE \`status\` = 'completed'
)`,
  },
  {
    label: "CTE (WITH clause)",
    category: "Runnable (PGlite)",
    description: "Common Table Expressions work across dialects",
    read: "mysql",
    write: "postgres",
    sql: `WITH \`big_spenders\` AS (
  SELECT \`user_id\`, SUM(\`total\`) AS \`spent\`
  FROM \`orders\`
  GROUP BY \`user_id\`
  HAVING SUM(\`total\`) > 200
)
SELECT \`users\`.\`name\`, \`big_spenders\`.\`spent\`
FROM \`big_spenders\`
JOIN \`users\` ON \`big_spenders\`.\`user_id\` = \`users\`.\`id\``,
  },
  {
    label: "Aggregates & CASE",
    category: "Runnable (PGlite)",
    description: "Aggregate functions and CASE WHEN expressions",
    read: "sqlglot",
    write: "postgres",
    sql: `SELECT
  users.name,
  COUNT(*) AS order_count,
  SUM(orders.total) AS total_spent,
  CASE
    WHEN SUM(orders.total) > 500 THEN 'VIP'
    WHEN SUM(orders.total) > 100 THEN 'Regular'
    ELSE 'New'
  END AS tier
FROM users
JOIN orders ON users.id = orders.user_id
GROUP BY users.name
ORDER BY total_spent DESC`,
  },
  {
    label: "Set Operations",
    category: "Runnable (PGlite)",
    description: "UNION ALL with ORDER BY and LIMIT",
    read: "sqlglot",
    write: "postgres",
    sql: `SELECT name, 'user' AS source FROM users WHERE id <= 3
UNION ALL
SELECT status AS name, 'order' AS source FROM orders WHERE total > 200
ORDER BY name
LIMIT 10`,
  },
];

type Tab = "sql" | "ast" | "results";

export default function App() {
  const [sqlInput, setSqlInput] = useState(DEFAULT_SQL);
  const [readDialect, setReadDialect] = useState("sqlglot");
  const [writeDialect, setWriteDialect] = useState("postgres");
  const [activeTab, setActiveTab] = useState<Tab>("sql");
  const [transpiled, setTranspiled] = useState("");
  const [ast, setAst] = useState<Expression | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [runTrigger, setRunTrigger] = useState(0);
  const [pgSql, setPgSql] = useState("");
  const [prettyPrint, setPrettyPrint] = useState(true);
  const [activePresetDesc, setActivePresetDesc] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doTranspile = useCallback(
    (sql: string, read: string, write: string, pretty?: boolean) => {
      const usePretty = pretty ?? prettyPrint;
      try {
        const readDial = Dialect.getOrRaise(read);
        const writeDial = Dialect.getOrRaise(write);
        const parsed = readDial.parse(sql);

        // Set the AST from the first expression
        const firstExpr = parsed.find((e) => e !== null) ?? null;
        setAst(firstExpr);

        // Generate output
        const output = parsed
          .map((expr) => {
            if (!expr) return "";
            return writeDial.generate(expr, { pretty: usePretty });
          })
          .filter((s) => s.length > 0)
          .join(";\n\n");

        setTranspiled(output);
        setError(undefined);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setTranspiled("");
        setAst(null);
      }
    },
    [prettyPrint],
  );

  // Auto-transpile when dialects change
  useEffect(() => {
    doTranspile(sqlInput, readDialect, writeDialect);
  }, [readDialect, writeDialect]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced transpile on SQL input change
  const handleSqlChange = useCallback(
    (newSql: string) => {
      setSqlInput(newSql);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        doTranspile(newSql, readDialect, writeDialect);
      }, 300);
    },
    [doTranspile, readDialect, writeDialect],
  );

  // Initial transpile
  useEffect(() => {
    doTranspile(sqlInput, readDialect, writeDialect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRun = useCallback(() => {
    try {
      const readDial = Dialect.getOrRaise(readDialect);
      const pgDial = Dialect.getOrRaise("postgres");
      const parsed = readDial.parse(sqlInput);
      const pgOutput = parsed
        .map((expr) => (expr ? pgDial.generate(expr) : ""))
        .filter((s) => s.length > 0)
        .join(";\n\n");
      setPgSql(pgOutput);
    } catch {
      setPgSql(sqlInput);
    }
    setActiveTab("results");
    setRunTrigger((prev) => prev + 1);
  }, [readDialect, sqlInput]);

  const handlePreset = useCallback(
    (index: number) => {
      const preset = PRESETS[index];
      if (!preset) return;
      setSqlInput(preset.sql);
      setReadDialect(preset.read);
      setWriteDialect(preset.write);
      doTranspile(preset.sql, preset.read, preset.write);

      // Show description banner
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
      setActivePresetDesc(preset.description);
      bannerTimeoutRef.current = setTimeout(() => setActivePresetDesc(null), 5000);
    },
    [doTranspile],
  );

  return (
    <div className="app">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-logo">
          <h1>
            <span className="logo-accent">sqlglot</span>-ts Playground
          </h1>
        </div>

        <div className="toolbar-separator" />

        <div className="toolbar-group">
          <DialectSelector label="Read" value={readDialect} onChange={setReadDialect} />
          <span style={{ color: "var(--text-muted)", fontSize: 16 }}>{"\u2192"}</span>
          <DialectSelector label="Write" value={writeDialect} onChange={setWriteDialect} />
        </div>

        <div className="toolbar-spacer" />

        <div className="toolbar-group">
          <button
            className={`btn btn-sm ${prettyPrint ? "btn-toggle-active" : ""}`}
            onClick={() => {
              const next = !prettyPrint;
              setPrettyPrint(next);
              doTranspile(sqlInput, readDialect, writeDialect, next);
            }}
            title={prettyPrint ? "Switch to compact output" : "Switch to pretty output"}
          >
            {prettyPrint ? "Pretty" : "Compact"}
          </button>
          <button
            className="btn"
            onClick={() => doTranspile(sqlInput, readDialect, writeDialect)}
          >
            Transpile
          </button>
          <button
            className="btn btn-primary"
            onClick={handleRun}
            title="Execute query against PGlite (auto-converts to PostgreSQL)"
          >
            Run
          </button>
        </div>
      </div>

      {/* Panels */}
      <div className="panels">
        {/* Left: Editor */}
        <div className="panel panel-left">
          <div className="panel-header">
            <span>Input</span>
            <select
              className="preset-selector"
              value=""
              onChange={(e) => {
                const idx = Number(e.target.value);
                if (!isNaN(idx)) handlePreset(idx);
                e.target.value = "";
              }}
            >
              <option value="" disabled>
                Examples...
              </option>
              {(() => {
                const categories: string[] = [];
                for (const p of PRESETS) {
                  if (!categories.includes(p.category)) categories.push(p.category);
                }
                return categories.map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {PRESETS.map((p, i) =>
                      p.category === cat ? (
                        <option key={i} value={i}>
                          {p.label}
                        </option>
                      ) : null,
                    )}
                  </optgroup>
                ));
              })()}
            </select>
          </div>
          {activePresetDesc && (
            <div
              className="preset-banner"
              onClick={() => setActivePresetDesc(null)}
            >
              {activePresetDesc}
            </div>
          )}
          <div className="panel-content">
            <SqlEditor value={sqlInput} onChange={handleSqlChange} />
          </div>
        </div>

        {/* Right: Tabs */}
        <div className="panel">
          <div className="tabs">
            <button
              className={`tab ${activeTab === "sql" ? "active" : ""}`}
              onClick={() => setActiveTab("sql")}
            >
              SQL
            </button>
            <button
              className={`tab ${activeTab === "ast" ? "active" : ""}`}
              onClick={() => setActiveTab("ast")}
            >
              AST
            </button>
            <button
              className={`tab ${activeTab === "results" ? "active" : ""}`}
              onClick={() => setActiveTab("results")}
            >
              Results
            </button>
          </div>
          <div className="panel-content">
            {activeTab === "sql" && (
              <TranspileOutput sql={transpiled} error={error} />
            )}
            {activeTab === "ast" && <AstViewer expression={ast} />}
            {activeTab === "results" && (
              <QueryResults
                sql={pgSql || transpiled || sqlInput}
                autoRun={runTrigger > 0}
                key={runTrigger}
              />
            )}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="status-bar">
        <span className={error ? "status-error" : "status-success"}>
          {error ? "Parse error" : "Ready"}
        </span>
        <span>
          {readDialect} {"\u2192"} {writeDialect}
        </span>
      </div>
    </div>
  );
}
