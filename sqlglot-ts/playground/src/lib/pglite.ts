import { PGlite } from "@electric-sql/pglite";

export interface QueryResult {
  columns: string[];
  rows: Array<Record<string, any>>;
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
  try {
    const pg = await getDb();
    const start = performance.now();
    const res = await pg.query(sql);
    const duration = performance.now() - start;

    const columns = (res.fields ?? []).map((f) => f.name);

    return {
      columns,
      rows: res.rows as Array<Record<string, any>>,
      rowCount: res.affectedRows ?? res.rows.length,
      duration,
    };
  } catch (err: any) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      duration: 0,
      error: err?.message ?? String(err),
    };
  }
}
