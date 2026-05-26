// Phase 1 backfill: populate transmission.source_books[].
//
// Itqan's profile data doesn't say WHICH classical book attests each
// (student, teacher) edge — only the flat teachers[] / students[] arrays.
// The honest approximation: for each edge, source_books = the intersection
// of classical_sources keys mentioned by BOTH narrators. If both Sufyān and
// his shaykh appear in تهذيب الكمال, that book is a candidate attestation
// source for their teacher-student relationship.
//
// Run: npx tsx scripts/backfill-transmission-sources.ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Pool } from "pg";
import type { ItqanProfile } from "../src/lib/import/transform";

config({ path: ".env.local" });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
});

const DATA = join(process.cwd(), "data", "itqan");

function shardFiles(): string[] {
  return readdirSync(DATA)
    .filter((f) => f.startsWith("profiles_") && f.endsWith(".json"))
    .sort();
}

async function main() {
  console.log("Loading Itqan classical_sources per narrator …");
  const sourcesByNarrator = new Map<number, Set<string>>();
  for (const shard of shardFiles()) {
    const data = JSON.parse(readFileSync(join(DATA, shard), "utf8")) as Record<
      string,
      ItqanProfile
    >;
    for (const p of Object.values(data)) {
      const keys = Object.keys(p.classical_sources ?? {});
      if (keys.length > 0) sourcesByNarrator.set(p.id, new Set(keys));
    }
    console.log(`  loaded ${shard.padEnd(34)} (${sourcesByNarrator.size} so far)`);
  }

  console.log("\nStreaming transmission rows …");
  const all = await pool.query<{ student_id: number; teacher_id: number }>(
    "SELECT student_id, teacher_id FROM transmission",
  );
  console.log(`  ${all.rows.length.toLocaleString()} edges to backfill`);

  // Batch updates via a temp-table-style approach: build (student, teacher, sources)
  // arrays then do one statement per chunk.
  const CHUNK = 1000;
  let touched = 0;
  for (let i = 0; i < all.rows.length; i += CHUNK) {
    const slice = all.rows.slice(i, i + CHUNK);
    const studentIds: number[] = [];
    const teacherIds: number[] = [];
    const sourcesArrays: string[][] = [];
    for (const row of slice) {
      const sStu = sourcesByNarrator.get(row.student_id);
      const sTea = sourcesByNarrator.get(row.teacher_id);
      let intersect: string[] = [];
      if (sStu && sTea) {
        intersect = [...sStu].filter((b) => sTea.has(b));
      }
      studentIds.push(row.student_id);
      teacherIds.push(row.teacher_id);
      sourcesArrays.push(intersect);
    }
    // Bulk update via UNNEST. Postgres won't let us pass nested arrays in a
    // single param, so we'll send as a JSON text and parse server-side.
    const payload = sourcesArrays.map((arr, idx) => ({
      s: studentIds[idx],
      t: teacherIds[idx],
      b: arr,
    }));
    await pool.query(
      `UPDATE transmission AS x
       SET source_books = u.books
       FROM (
         SELECT (e->>'s')::int AS s, (e->>'t')::int AS t,
                ARRAY(SELECT jsonb_array_elements_text(e->'b')) AS books
         FROM jsonb_array_elements($1::jsonb) AS e
       ) AS u
       WHERE x.student_id = u.s AND x.teacher_id = u.t`,
      [JSON.stringify(payload)],
    );
    touched += slice.length;
    if (touched % 50000 === 0 || touched === all.rows.length) {
      console.log(`  updated ${touched.toLocaleString()} / ${all.rows.length.toLocaleString()}`);
    }
  }

  const filled = await pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM transmission WHERE array_length(source_books, 1) > 0",
  );
  console.log(
    `\nBackfill complete. ${filled.rows[0].n.toLocaleString()} edges have ≥1 source book.`,
  );
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
