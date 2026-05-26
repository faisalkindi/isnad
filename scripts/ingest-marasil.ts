// Phase 2 ingestion: load al-Marāsīl non-meeting records into the
// documented_non_meeting table. Matches Arabic names to narrator IDs via the
// existing name_variant trigram index.
//
// Run: npx tsx scripts/ingest-marasil.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Pool } from "pg";
import { normalizeArabic } from "../src/lib/normalize";

config({ path: ".env.local" });

interface RawEntry {
  student_name_ar: string;
  teacher_name_ar: string;
  phrase_ar: string;
  page_ref: string | null;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
});

const FILE = join(process.cwd(), "data", "marasil", "marasil_non_meetings.json");
const SOURCE_BOOK_KEY = "marasil_ibn_abi_hatim";
const SIM_THRESHOLD = 0.7;

async function matchNarratorId(name: string): Promise<number | null> {
  const norm = normalizeArabic(name).trim();
  if (norm.length < 3) return null;
  const r = await pool.query<{ id: number; score: number }>(
    `SELECT n.id, max(similarity(nv.normalized_variant, $1)) AS score
       FROM name_variant nv
       JOIN narrator n ON n.id = nv.narrator_id
      WHERE nv.normalized_variant % $1
      GROUP BY n.id
      ORDER BY score DESC,
               (SELECT count(*) FROM source_grade sg WHERE sg.narrator_id = n.id) DESC
      LIMIT 1`,
    [norm],
  );
  if (r.rows.length === 0) return null;
  if (Number(r.rows[0].score) < SIM_THRESHOLD) return null;
  return r.rows[0].id;
}

async function main() {
  const entries: RawEntry[] = JSON.parse(readFileSync(FILE, "utf8"));
  console.log(`Loaded ${entries.length} entries from al-Marāsīl.`);

  await pool.query("TRUNCATE documented_non_meeting RESTART IDENTITY");

  let matched = 0;
  let inserted = 0;
  let unmatched: { entry: RawEntry; missing: string }[] = [];
  let i = 0;
  for (const e of entries) {
    i++;
    if (i % 50 === 0) console.log(`  processed ${i}/${entries.length} (matched ${matched}, inserted ${inserted})`);
    const [studentId, teacherId] = await Promise.all([
      matchNarratorId(e.student_name_ar),
      matchNarratorId(e.teacher_name_ar),
    ]);
    if (studentId == null || teacherId == null) {
      const missing = studentId == null
        ? `student «${e.student_name_ar}»`
        : `teacher «${e.teacher_name_ar}»`;
      unmatched.push({ entry: e, missing });
      continue;
    }
    matched++;
    if (studentId === teacherId) continue; // self-loop noise
    const ins = await pool.query(
      `INSERT INTO documented_non_meeting
         (student_id, teacher_id, source_book, phrase_ar, page_ref)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (student_id, teacher_id, source_book) DO NOTHING
       RETURNING id`,
      [studentId, teacherId, SOURCE_BOOK_KEY, e.phrase_ar.slice(0, 500), e.page_ref],
    );
    if ((ins.rowCount ?? 0) > 0) inserted++;
  }

  console.log(`\nDone.`);
  console.log(`  matched both names: ${matched}/${entries.length} (${((matched/entries.length)*100).toFixed(1)}%)`);
  console.log(`  inserted rows:      ${inserted}`);
  console.log(`  unmatched:          ${unmatched.length}`);
  if (unmatched.length > 0 && unmatched.length <= 30) {
    console.log(`\nFirst few unmatched:`);
    for (const u of unmatched.slice(0, 10)) {
      console.log(`  ${u.missing} — phrase: ${u.entry.phrase_ar.slice(0, 60)}…`);
    }
  }
}

main()
  .catch((err) => {
    console.error("Ingestion failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
