import { PGlite } from "@electric-sql/pglite";

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  duration: number;
  error?: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  total NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

const SEED = `
INSERT INTO users (id, name, email) VALUES
  (1, 'Alice',   'alice@example.com'),
  (2, 'Bob',     'bob@example.com'),
  (3, 'Charlie', NULL),
  (4, 'Diana',   'diana@example.com'),
  (5, 'Eve',     NULL);

INSERT INTO orders (id, user_id, total, status, created_at) VALUES
  (1,  1, 250.00, 'completed',  '2024-01-15 10:00:00'),
  (2,  1, 175.00, 'completed',  '2024-02-20 14:30:00'),
  (3,  1, 320.00, 'pending',    '2024-03-10 09:15:00'),
  (4,  2,  89.50, 'completed',  '2024-01-20 11:00:00'),
  (5,  2, 150.00, 'cancelled',  '2024-02-15 16:45:00'),
  (6,  2,  45.00, 'completed',  '2024-03-05 08:30:00'),
  (7,  3,  55.00, 'pending',    '2024-02-28 13:00:00'),
  (8,  4, 410.00, 'completed',  '2024-01-10 09:00:00'),
  (9,  4,  95.00, 'completed',  '2024-02-25 15:00:00'),
  (10, 4, 230.00, 'cancelled',  '2024-03-15 10:30:00'),
  (11, 1, 125.00, 'cancelled',  '2024-03-20 12:00:00');
`;

let db: PGlite | null = null;

async function getDb(): Promise<PGlite> {
  if (!db) {
    db = new PGlite();
    await db.exec(SCHEMA);
    await db.exec(SEED);
  }
  return db;
}

export async function executeQuery(sql: string): Promise<QueryResult> {
  const start = performance.now();
  try {
    const pg = await getDb();
    const res = await pg.query(sql);
    const duration = performance.now() - start;

    const columns = (res.fields ?? []).map((f: { name: string }) => f.name);
    const rows = (res.rows ?? []) as Record<string, unknown>[];

    return {
      columns,
      rows,
      rowCount: rows.length,
      duration,
    };
  } catch (err) {
    const duration = performance.now() - start;
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      duration,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
