// Imports Itqan's narrator data into Postgres. Idempotent (truncates first).
// Run: npx tsx scripts/import-itqan.ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Pool } from "pg";
import { transformProfile, type ItqanProfile } from "../src/lib/import/transform";

config({ path: ".env.local" });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
});
const DATA = join(process.cwd(), "data", "itqan");
const MAX_PARAMS = 60000;

/** Insert rows in batches that stay under Postgres's bound-parameter limit. */
async function insertBatched(
  table: string,
  columns: string[],
  rows: unknown[][],
  conflictClause = "",
): Promise<void> {
  if (rows.length === 0) return;
  const colCount = columns.length;
  const batchSize = Math.floor(MAX_PARAMS / colCount);
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values: unknown[] = [];
    const tuples = batch.map((row, r) => {
      const placeholders = columns.map((_, c) => `$${r * colCount + c + 1}`);
      values.push(...row);
      return `(${placeholders.join(",")})`;
    });
    await pool.query(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${tuples.join(",")} ${conflictClause}`,
      values,
    );
  }
}

function shardFiles(): string[] {
  return readdirSync(DATA)
    .filter((f) => f.startsWith("profiles_") && f.endsWith(".json"))
    .sort();
}

const NARRATOR_COLS = [
  "id", "full_name", "kunya", "laqab", "nasab", "grade_en", "grade_ar",
  "death", "tabaqat", "city", "itqan_confidence", "id_score", "grade_score",
];

async function importData() {
  console.log("Truncating tables ...");
  await pool.query(
    "TRUNCATE narrator, name_variant, source_grade, transmission RESTART IDENTITY CASCADE",
  );

  const narratorIds = new Set<number>();

  // Pass 1: narrators, name variants, source grades — shard by shard.
  for (const shard of shardFiles()) {
    const data = JSON.parse(readFileSync(join(DATA, shard), "utf8")) as Record<
      string,
      ItqanProfile
    >;
    const nRows: unknown[][] = [];
    const nvRows: unknown[][] = [];
    const sgRows: unknown[][] = [];

    for (const profile of Object.values(data)) {
      const t = transformProfile(profile);
      const n = t.narrator;
      narratorIds.add(n.id);
      nRows.push([
        n.id, n.full_name, n.kunya, n.laqab, n.nasab, n.grade_en, n.grade_ar,
        n.death, n.tabaqat, n.city, n.itqan_confidence, n.id_score, n.grade_score,
      ]);
      for (const v of t.nameVariants) {
        nvRows.push([v.narrator_id, v.variant, v.normalized_variant]);
      }
      for (const s of t.sourceGrades) {
        sgRows.push([s.narrator_id, s.source_book, s.entry_id, s.grade_en, s.grade_ar]);
      }
    }

    await insertBatched("narrator", NARRATOR_COLS, nRows, "ON CONFLICT (id) DO NOTHING");
    await insertBatched("name_variant", ["narrator_id", "variant", "normalized_variant"], nvRows);
    await insertBatched("source_grade", ["narrator_id", "source_book", "entry_id", "grade_en", "grade_ar"], sgRows);
    console.log(`  ${shard.padEnd(34)} ${nRows.length} narrators`);
  }

  // Pass 2: transmission edges — both endpoints must be real narrators; dedup.
  const edges = new Set<string>();
  for (const shard of shardFiles()) {
    const data = JSON.parse(readFileSync(join(DATA, shard), "utf8")) as Record<
      string,
      ItqanProfile
    >;
    for (const profile of Object.values(data)) {
      for (const tr of transformProfile(profile).transmissions) {
        if (narratorIds.has(tr.student_id) && narratorIds.has(tr.teacher_id)) {
          edges.add(`${tr.student_id}|${tr.teacher_id}`);
        }
      }
    }
  }
  const edgeRows = [...edges].map((k) => k.split("|").map(Number));
  await insertBatched("transmission", ["student_id", "teacher_id"], edgeRows, "ON CONFLICT DO NOTHING");
  console.log(`  transmission edges: ${edgeRows.length}`);

  // Verify.
  const count = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM narrator");
  console.log(`\nnarrator count: ${count.rows[0].n.toLocaleString()}`);
  if (count.rows[0].n !== 115735) {
    throw new Error(`Expected 115735 narrators, got ${count.rows[0].n}`);
  }
  console.log("Import verified: 115,735 narrators.");

  const size = await pool.query<{ size: string }>(
    "SELECT pg_size_pretty(pg_database_size(current_database())) AS size",
  );
  console.log(`database size: ${size.rows[0].size}`);
}

importData()
  .catch((err) => {
    console.error("Import failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
