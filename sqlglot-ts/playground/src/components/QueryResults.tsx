import { useState, useCallback, useEffect, useRef } from "react";
import { executeQuery, type QueryResult } from "../utils/pglite";

interface QueryResultsProps {
  sql: string;
  autoRun?: boolean;
}

type Status = "idle" | "running" | "done" | "error";

export function QueryResults({ sql, autoRun }: QueryResultsProps) {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const runIdRef = useRef(0);

  const run = useCallback(async () => {
    const trimmed = sql.trim();
    if (!trimmed) return;

    const id = ++runIdRef.current;
    setStatus("running");
    setResult(null);

    const res = await executeQuery(trimmed);

    // Ignore stale results if another run started.
    if (id !== runIdRef.current) return;

    setResult(res);
    setStatus(res.error ? "error" : "done");
  }, [sql]);

  useEffect(() => {
    if (autoRun) {
      run();
    }
  }, [autoRun, run]);

  return (
    <div className="query-results">
      <div className="query-results-toolbar">
        <button className="btn-run" onClick={run} disabled={status === "running"}>
          {status === "running" ? "Running\u2026" : "Run Query"}
        </button>
        {result && !result.error && (
          <span className="stats">
            {result.columns.length > 0
              ? `${result.rowCount} row${result.rowCount !== 1 ? "s" : ""}`
              : `${result.rowCount} row${result.rowCount !== 1 ? "s" : ""} affected`}
            {" \u00b7 "}
            {result.duration < 1000
              ? `${result.duration.toFixed(1)}ms`
              : `${(result.duration / 1000).toFixed(3)}s`}
          </span>
        )}
      </div>

      <div className="query-results-body">
        {status === "idle" && <Placeholder text="Click Run to execute the query." />}
        {status === "running" && <Placeholder text="Executing query\u2026" spinner />}
        {status === "error" && result?.error && <ErrorBox message={result.error} />}
        {status === "done" && result && !result.error && <ResultTable result={result} />}
      </div>
    </div>
  );
}

function Placeholder({ text, spinner }: { text: string; spinner?: boolean }) {
  return (
    <div className="placeholder">
      {spinner && <span className="spinner" />}
      <span>{text}</span>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="error-box">
      <div className="error-title">Query Error</div>
      <pre>{message}</pre>
    </div>
  );
}

function ResultTable({ result }: { result: QueryResult }) {
  if (result.columns.length === 0) {
    return (
      <div className="placeholder">
        <span>
          Statement executed successfully. {result.rowCount} row
          {result.rowCount !== 1 ? "s" : ""} affected.
        </span>
      </div>
    );
  }

  return (
    <div className="result-table-wrapper">
      <table>
        <thead>
          <tr>
            {result.columns.map((col, i) => (
              <th key={i}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, ri) => (
            <tr key={ri}>
              {result.columns.map((col, ci) => {
                const value = row[col];
                const isNull = value === null || value === undefined;
                return (
                  <td key={ci} className={isNull ? "null-value" : undefined}>
                    {formatCell(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default QueryResults;
