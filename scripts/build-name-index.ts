// Fills name_variant.normalized_variant for every row, using normalizeArabic.
// Run after import. Run: npx tsx scripts/build-name-index.ts
import { config } from "dotenv";
import { Pool } from "pg";
import { normalizeArabic } from "../src/lib/normalize";

config({ path: ".env.local" });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
});

async function buildIndex() {
  const { rows } = await pool.query<{ id: string; variant: string }>(
    "SELECT id, variant FROM name_variant",
  );
  console.log(`normalizing ${rows.length.toLocaleString()} name variants ...`);

  const batchSize = 20000;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values: unknown[] = [];
    const tuples = batch.map((r, idx) => {
      values.push(r.id, normalizeArabic(r.variant));
      return `($${idx * 2 + 1}::bigint, $${idx * 2 + 2}::text)`;
    });
    await pool.query(
      `UPDATE name_variant AS nv SET normalized_variant = v.norm
       FROM (VALUES ${tuples.join(",")}) AS v(id, norm)
       WHERE nv.id = v.id`,
      values,
    );
  }

  const empty = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM name_variant
     WHERE normalized_variant = '' OR normalized_variant IS NULL`,
  );
  console.log(`rows still missing a normalized form: ${empty.rows[0].n}`);
  if (empty.rows[0].n > 0) {
    throw new Error("some name variants were not normalized");
  }
  console.log("Name index built.");
}

buildIndex()
  .catch((err) => {
    console.error("Build failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
