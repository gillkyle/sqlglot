interface DialectSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

// Dialects where all active tests pass (zero failures)
const FULLY_SUPPORTED = new Set(["sqlglot", "mysql", "postgres", "athena", "spark2", "drill"]);

const DIALECTS = [
  { value: "sqlglot", label: "SQLGlot" },
  { value: "athena", label: "Athena" },
  { value: "bigquery", label: "BigQuery" },
  { value: "clickhouse", label: "ClickHouse" },
  { value: "databricks", label: "Databricks" },
  { value: "doris", label: "Doris" },
  { value: "dremio", label: "Dremio" },
  { value: "drill", label: "Drill" },
  { value: "druid", label: "Druid" },
  { value: "duckdb", label: "DuckDB" },
  { value: "dune", label: "Dune" },
  { value: "exasol", label: "Exasol" },
  { value: "fabric", label: "Fabric" },
  { value: "hive", label: "Hive" },
  { value: "materialize", label: "Materialize" },
  { value: "mysql", label: "MySQL" },
  { value: "oracle", label: "Oracle" },
  { value: "postgres", label: "PostgreSQL" },
  { value: "presto", label: "Presto" },
  { value: "prql", label: "PRQL" },
  { value: "redshift", label: "Redshift" },
  { value: "risingwave", label: "RisingWave" },
  { value: "singlestore", label: "SingleStore" },
  { value: "snowflake", label: "Snowflake" },
  { value: "solr", label: "Solr" },
  { value: "spark", label: "Spark" },
  { value: "spark2", label: "Spark 2" },
  { value: "sqlite", label: "SQLite" },
  { value: "starrocks", label: "StarRocks" },
  { value: "tableau", label: "Tableau" },
  { value: "teradata", label: "Teradata" },
  { value: "trino", label: "Trino" },
  { value: "tsql", label: "T-SQL" },
];

export default function DialectSelector({ label, value, onChange }: DialectSelectorProps) {
  return (
    <div className="dialect-selector">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {DIALECTS.map((d) => (
          <option key={d.value} value={d.value}>
            {FULLY_SUPPORTED.has(d.value) ? d.label : `${d.label} \u{1F7E1}`}
          </option>
        ))}
      </select>
    </div>
  );
}
