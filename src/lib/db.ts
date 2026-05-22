import { Pool, type QueryResult, type QueryResultRow } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — add it to .env.local");
}

/** Shared connection pool. Neon requires SSL. */
export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: true },
});

/** Run a parameterized SQL query against the pool. */
export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params as unknown[]);
}
