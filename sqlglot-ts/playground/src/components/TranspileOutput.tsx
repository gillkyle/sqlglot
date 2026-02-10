interface TranspileOutputProps {
  sql: string;
  error?: string;
}

export default function TranspileOutput({ sql, error }: TranspileOutputProps) {
  if (error) {
    return (
      <div className="transpile-output">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  if (!sql) {
    return (
      <div className="transpile-output">
        <div className="empty-state">
          Enter SQL in the editor and select dialects to transpile.
        </div>
      </div>
    );
  }

  return (
    <div className="transpile-output">
      <pre>
        <code>{sql}</code>
      </pre>
    </div>
  );
}
