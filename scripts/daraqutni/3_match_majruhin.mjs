// Match parsed Ibn Hibban's al-Majruhin entries to our narrator table and
// insert into narrator_grade_source. Mirrors the Daraqutni importer with
// just author_ar + source_book + input file swapped.
import { promises as fs } from "node:fs";
import pg from "pg";
import { normalizeArabic } from "../../src/lib/normalize.ts";

const ENTRIES_FILE = "data/ibn_hibban_majruhin/_entries.jsonl";
const UNMATCHED_FILE = "data/ibn_hibban_majruhin/_unmatched.jsonl";
const SOURCE_BOOK = "ibn_hibban_majruhin";
const AUTHOR_AR = "ابن حبان";
const MATCH_THRESHOLD = 0.5;

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL pg_trgm.similarity_threshold = 0.4");

  const lines = (await fs.readFile(ENTRIES_FILE, "utf8"))
    .split("\n")
    .filter((l) => l.trim().length > 0);
  console.log(`loaded ${lines.length} verdicts from ${ENTRIES_FILE}`);

  let inserted = 0;
  let skipped = 0;
  let unmatched = 0;
  const unmatchedRows = [];

  for (const line of lines) {
    const e = JSON.parse(line);
    const normalized = normalizeArabic(e.narrator_name);
    const candidates = await client.query(
      `SELECT id, full_name, similarity(full_name, $1) AS score
       FROM narrator
       WHERE full_name % $1
       ORDER BY score DESC
       LIMIT 3`,
      [e.narrator_name],
    );

    let pick = null;
    if (candidates.rows.length > 0 && candidates.rows[0].score >= MATCH_THRESHOLD) {
      pick = candidates.rows[0];
    }
    if (!pick) {
      unmatched++;
      unmatchedRows.push({
        narrator_name: e.narrator_name,
        entry_num: e.entry_num,
        page: e.page,
        top_candidates: candidates.rows.map((c) => ({
          id: c.id,
          name: c.full_name.slice(0, 60),
          score: Number(c.score),
        })),
      });
      continue;
    }

    const r = await client.query(
      `INSERT INTO narrator_grade_source
         (narrator_id, source_book, author_ar, verdict_ar, relayed_via, page_ref, raw_entry, match_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (narrator_id, source_book, md5(verdict_ar)) DO NOTHING
       RETURNING id`,
      [pick.id, SOURCE_BOOK, AUTHOR_AR, e.verdict_ar, null, null, e.raw_entry, Number(pick.score)],
    );
    if (r.rowCount > 0) inserted++;
    else skipped++;

    const total = inserted + skipped + unmatched;
    if (total % 100 === 0 && total > 0) {
      console.log(`  ${total}/${lines.length} — inserted=${inserted} dup=${skipped} unmatched=${unmatched}`);
    }
  }

  await client.query("COMMIT");
  await client.query(
    `INSERT INTO source_import_log (source_book, total_entries, matched, unmatched, last_run_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (source_book) DO UPDATE
       SET total_entries = $2, matched = $3, unmatched = $4, last_run_at = now()`,
    [SOURCE_BOOK, lines.length, inserted + skipped, unmatched],
  );
  await fs.writeFile(UNMATCHED_FILE, unmatchedRows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  console.log(`\nDONE:\n  inserted: ${inserted}\n  duplicate: ${skipped}\n  unmatched: ${unmatched}`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
