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
          <button className="btn btn-primary" onClick={handleRun}>
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
