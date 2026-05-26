// Match parsed موسوعة entries to our narrator table via pg_trgm similarity,
// then insert into narrator_grade_source.
//
// Strategy:
//   1. Normalize the Daraqutni narrator name with the SAME normalizeArabic
//      we already use everywhere (strips tashkīl, unifies hamzas).
//   2. Query narrator table for top-3 trigram matches against full_name.
//   3. Accept the top match if similarity ≥ 0.6 (high-confidence). Below
//      that → leave unmatched (logged) — better to miss than to attribute
//      a verdict to the wrong narrator.
//   4. Bulk-insert verdicts. The unique index on
//      (narrator_id, source_book, md5(verdict_ar)) makes re-runs idempotent.

import { promises as fs } from "node:fs";
import pg from "pg";
import { normalizeArabic } from "../../src/lib/normalize.ts";

const ENTRIES_FILE = "data/daraqutni_mawsuah/_entries.jsonl";
const UNMATCHED_FILE = "data/daraqutni_mawsuah/_unmatched.jsonl";
const SOURCE_BOOK = "daraqutni_mawsuah";
const AUTHOR_AR = "الدارقطني";
// JS-level acceptance threshold. Candidates below this are logged as
// unmatched (we'd rather miss than mis-attribute a verdict). The SQL-level
// trigram threshold (below) is looser so we can SEE the near-misses and
// decide per-row whether the top candidate clears this bar.
const MATCH_THRESHOLD = 0.5;

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Per-session trigram threshold. We use 0.4 here to SURFACE near-miss
  // candidates so the JS-level acceptance check (MATCH_THRESHOLD) can
  // judge them. Going lower than 0.4 inflates candidate counts without
  // improving recall (the additional candidates are noise).
  await client.query("BEGIN");
  await client.query("SET LOCAL pg_trgm.similarity_threshold = 0.4");

  const lines = (await fs.readFile(ENTRIES_FILE, "utf8"))
    .split("\n")
    .filter((l) => l.trim().length > 0);
  console.log(`loaded ${lines.length} verdicts from ${ENTRIES_FILE}`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let unmatched = 0;
  const unmatchedRows = [];

  for (const line of lines) {
    const e = JSON.parse(line);
    const normalized = normalizeArabic(e.narrator_name);

    // Find best match by trigram similarity over normalized full_name.
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

    // Insert verdict (idempotent on the unique index).
    const r = await client.query(
      `INSERT INTO narrator_grade_source
         (narrator_id, source_book, author_ar, verdict_ar, relayed_via, page_ref, raw_entry, match_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (narrator_id, source_book, md5(verdict_ar)) DO NOTHING
       RETURNING id`,
      [
        pick.id,
        SOURCE_BOOK,
        AUTHOR_AR,
        e.verdict_ar,
        e.relayed_via,
        e.page_ref,
        e.raw_entry,
        Number(pick.score),
      ],
    );
    if (r.rowCount > 0) inserted++;
    else skipped++;

    const total = inserted + updated + skipped + unmatched;
    if (total % 100 === 0 && total > 0) {
      console.log(
        `  ${total}/${lines.length} — inserted=${inserted} dup=${skipped} unmatched=${unmatched}`,
      );
    }
  }

  await client.query("COMMIT");

  // Log import stats
  await client.query(
    `INSERT INTO source_import_log (source_book, total_entries, matched, unmatched, last_run_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (source_book) DO UPDATE
       SET total_entries = $2, matched = $3, unmatched = $4, last_run_at = now()`,
    [SOURCE_BOOK, lines.length, inserted + skipped, unmatched],
  );

  await fs.writeFile(
    UNMATCHED_FILE,
    unmatchedRows.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf8",
  );

  console.log(
    `\nDONE:\n` +
      `  inserted:  ${inserted}\n` +
      `  duplicate: ${skipped}\n` +
      `  unmatched: ${unmatched} (saved to ${UNMATCHED_FILE})\n`,
  );

  await client.end();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
