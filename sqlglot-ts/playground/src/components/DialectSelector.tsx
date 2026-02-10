interface DialectSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const DIALECTS = [
  { value: "sqlglot", label: "SQLGlot" },
  { value: "bigquery", label: "BigQuery" },
  { value: "duckdb", label: "DuckDB" },
  { value: "mysql", label: "MySQL" },
  { value: "postgres", label: "PostgreSQL" },
  { value: "singlestore", label: "SingleStore" },
  { value: "sqlite", label: "SQLite" },
];

export default function DialectSelector({ label, value, onChange }: DialectSelectorProps) {
  return (
    <div className="dialect-selector">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {DIALECTS.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  );
}
