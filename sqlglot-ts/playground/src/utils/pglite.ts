import { PGlite } from "@electric-sql/pglite";

export interface QueryResult {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  duration: number;
  error?: string;
}

let db: PGlite | null = null;

async function getDb(): Promise<PGlite> {
  if (!db) {
    db = new PGlite();
    await db.waitReady;
  }
  return db;
}

export async function executeQuery(sql: string): Promise<QueryResult> {
  const start = performance.now();
  try {
    const pg = await getDb();
    const results = await pg.exec(sql);
    const duration = performance.now() - start;

    // exec() returns an array of Results, one per statement; use the last one
    const last = results[results.length - 1];
    if (!last) {
      return { columns: [], rows: [], rowCount: 0, duration };
    }

    return {
      columns: last.fields.map((f) => f.name),
      rows: last.rows as Array<Record<string, unknown>>,
      rowCount: last.affectedRows ?? last.rows.length,
      duration,
    };
  } catch (err: unknown) {
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
