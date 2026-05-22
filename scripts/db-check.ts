// Prints row counts for every table. Run: npx tsx scripts/db-check.ts
import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
});

const tables = [
  "narrator",
  "name_variant",
  "source_grade",
  "transmission",
  "match_cache",
  "usage_counter",
];

async function check() {
  for (const t of tables) {
    const r = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${t}`,
    );
    console.log(`${t.padEnd(16)} ${r.rows[0].n.toLocaleString()}`);
  }
}

check()
  .catch((err) => {
    console.error("DB check failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
