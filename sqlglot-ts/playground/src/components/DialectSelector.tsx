interface DialectSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const DIALECTS = [
  { value: "sqlglot", label: "SQLGlot" },
  { value: "postgres", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
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
