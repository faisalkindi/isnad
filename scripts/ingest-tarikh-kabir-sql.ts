// Phase 3 ingestion (SQL-bulk): move name resolution + insert into a single
// server-side SQL statement. Eliminates the 28K network round-trips that made
// the previous client-loop ingestion take 6-12 hours.
//
// Pipeline:
//   1. Load JSON
//   2. COPY all entries into a TEMP table in one round-trip
//   3. Single INSERT INTO attestation_verb SELECT ... FROM temp JOIN LATERAL
//      (trigram lookup) — runs entirely on Neon, uses the GIN index per row.
//
// Run: npx tsx scripts/ingest-tarikh-kabir-sql.ts [--limit N]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Pool } from "pg";
import { normalizeArabic } from "../src/lib/normalize";

config({ path: ".env.local" });

type Verb = "samaa" | "liqa" | "idraka" | "rawa" | "kataba";
interface RawEntry {
  narrator_name_ar: string;
  verb: Verb;
  other_party_name_ar: string;
  phrase_ar: string;
  biography_index: number;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
  max: 4,
});

const FILE = join(process.cwd(), "data", "tarikh_kabir", "tarikh_kabir_attestations.json");
const SOURCE_BOOK_KEY = "tarikh_kabir";
const SIM_THRESHOLD = 0.7;

const log = (s: string) => process.stderr.write(s + "\n");

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
  const all: RawEntry[] = JSON.parse(readFileSync(FILE, "utf8"));
  const entries = isFinite(limit) ? all.slice(0, limit) : all;
  log(`Loaded ${all.length} entries; processing ${entries.length}.`);

  // Pre-normalize names client-side once so the SQL doesn't have to.
  const rows = entries
    .map((e) => ({
      idx: e.biography_index,
      subject_norm: normalizeArabic(e.narrator_name_ar).trim(),
      other_norm: normalizeArabic(e.other_party_name_ar).trim(),
      verb: e.verb,
      phrase: e.phrase_ar.slice(0, 500),
    }))
    .filter((r) => r.subject_norm.length >= 3 && r.other_norm.length >= 3);
  log(`After name-length filter: ${rows.length} rows.`);

  const client = await pool.connect();
  try {
    log("Loading temp table …");
    const t0 = Date.now();
    await client.query("BEGIN");
    await client.query(`
      CREATE TEMP TABLE input_rows (
        idx int, subject_norm text, other_norm text, verb text, phrase text
      ) ON COMMIT DROP
    `);

    // Bulk-insert in chunks of 1000 (Postgres bound-params limit 65535).
    const COLS = 5;
    const CHUNK = 5000;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const placeholders = slice
        .map((_, idx) => `($${idx * COLS + 1},$${idx * COLS + 2},$${idx * COLS + 3},$${idx * COLS + 4},$${idx * COLS + 5})`)
        .join(",");
      const flat = slice.flatMap((r) => [r.idx, r.subject_norm, r.other_norm, r.verb, r.phrase]);
      await client.query(
        `INSERT INTO input_rows (idx, subject_norm, other_norm, verb, phrase) VALUES ${placeholders}`,
        flat,
      );
    }
    log(`  temp table loaded: ${rows.length} rows in ${Date.now() - t0}ms`);

    log("Resolving + inserting via single SQL …");
    const t1 = Date.now();
    // Set a generous statement timeout for the big join — but cap to 30 min
    // so a runaway plan doesn't block forever.
    await client.query("SET LOCAL statement_timeout = '1800000'");
    const result = await client.query(
      `INSERT INTO attestation_verb (student_id, teacher_id, verb, source_book, phrase_ar)
       SELECT
         CASE WHEN i.phrase ~ '^\\s*روى\\s+عنه' THEN o.narrator_id ELSE s.narrator_id END AS student_id,
         CASE WHEN i.phrase ~ '^\\s*روى\\s+عنه' THEN s.narrator_id ELSE o.narrator_id END AS teacher_id,
         i.verb::text AS verb,
         $1 AS source_book,
         i.phrase AS phrase_ar
       FROM input_rows i
       JOIN LATERAL (
         SELECT narrator_id, similarity(normalized_variant, i.subject_norm) AS score
           FROM name_variant
          WHERE normalized_variant % i.subject_norm
          ORDER BY similarity(normalized_variant, i.subject_norm) DESC
          LIMIT 1
       ) s ON s.score >= $2
       JOIN LATERAL (
         SELECT narrator_id, similarity(normalized_variant, i.other_norm) AS score
           FROM name_variant
          WHERE normalized_variant % i.other_norm
          ORDER BY similarity(normalized_variant, i.other_norm) DESC
          LIMIT 1
       ) o ON o.score >= $2
       WHERE s.narrator_id <> o.narrator_id
         AND i.verb IN ('samaa','liqa','idraka','rawa','kataba')
       ON CONFLICT (student_id, teacher_id, verb, source_book) DO NOTHING`,
      [SOURCE_BOOK_KEY, SIM_THRESHOLD],
    );
    log(`  bulk SQL done in ${Date.now() - t1}ms (inserted ${result.rowCount} new rows)`);

    await client.query("COMMIT");

    const counts = await client.query<{ verb: string; n: number }>(
      "SELECT verb, count(*)::int AS n FROM attestation_verb GROUP BY verb ORDER BY n DESC",
    );
    log("\nFinal counts:");
    for (const r of counts.rows) log(`  ${r.verb}: ${r.n.toLocaleString()}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  await pool.end();
}

main().catch((e) => {
  log("FATAL: " + String(e));
  process.exit(1);
});
