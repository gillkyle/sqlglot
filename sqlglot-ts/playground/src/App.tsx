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
  sql: string;
  read: string;
  write: string;
}

const PRESETS: Preset[] = [
  {
    label: "Identifier Quoting",
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
    description: "Postgres ILIKE becomes MySQL LIKE (no ILIKE in MySQL)",
    read: "postgres",
    write: "mysql",
    sql: `SELECT name, email
FROM users
WHERE name ILIKE '%alice%'
   OR email ILIKE '%example%'`,
  },
  {
    label: "JOINs & Subqueries",
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
    label: "NULL Handling",
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
  {
    label: "Runnable Query",
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doTranspile = useCallback((sql: string, read: string, write: string) => {
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
          return writeDial.generate(expr, { pretty: true });
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
  }, []);

  // Auto-transpile when dialects change
  useEffect(() => {
    doTranspile(sqlInput, readDialect, writeDialect);
    if (writeDialect !== "postgres" && activeTab === "results") {
      setActiveTab("sql");
    }
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
    setActiveTab("results");
    setRunTrigger((prev) => prev + 1);
  }, []);

  const handlePreset = useCallback(
    (index: number) => {
      const preset = PRESETS[index];
      if (!preset) return;
      setSqlInput(preset.sql);
      setReadDialect(preset.read);
      setWriteDialect(preset.write);
      doTranspile(preset.sql, preset.read, preset.write);
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
            className="btn"
            onClick={() => doTranspile(sqlInput, readDialect, writeDialect)}
          >
            Transpile
          </button>
          <button
            className="btn btn-primary"
            onClick={handleRun}
            disabled={writeDialect !== "postgres"}
            title={
              writeDialect !== "postgres"
                ? "Run requires PostgreSQL as the write dialect (PGlite)"
                : "Execute query against PGlite"
            }
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
              {PRESETS.map((p, i) => (
                <option key={i} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
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
              className={`tab ${activeTab === "results" ? "active" : ""} ${writeDialect !== "postgres" ? "tab-disabled" : ""}`}
              onClick={() => setActiveTab("results")}
              disabled={writeDialect !== "postgres"}
              title={
                writeDialect !== "postgres"
                  ? "Results require PostgreSQL as the write dialect"
                  : undefined
              }
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
                sql={transpiled || sqlInput}
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
