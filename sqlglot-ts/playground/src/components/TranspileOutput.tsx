import { useState, useCallback } from "react";

interface TranspileOutputProps {
  sql: string;
  error?: string;
}

export default function TranspileOutput({ sql, error }: TranspileOutputProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [sql]);

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
      <div className="transpile-output-wrapper">
        <button className="copy-btn" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy"}
        </button>
        <pre>
          <code>{sql}</code>
        </pre>
      </div>
    </div>
  );
}
