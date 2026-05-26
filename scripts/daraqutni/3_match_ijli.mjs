// Match parsed al-'Ijli entries and import into narrator_grade_source.
//
// Important: al-'Ijli's source text is heavily diacritized ("الْحَارِث") while
// our narrator table stores undiacritized names. We strip tashkeel before
// the trigram query (same normalizeArabic the main matcher uses) and search
// the name_variant table which has a GIN trgm index on normalized_variant.
import { promises as fs } from "node:fs";
import pg from "pg";

const ENTRIES_FILE = "data/ijli_thiqat/_entries.jsonl";
const UNMATCHED_FILE = "data/ijli_thiqat/_unmatched.jsonl";
const SOURCE_BOOK = "ijli_thiqat";
const AUTHOR_AR = "العجلي";
const MATCH_THRESHOLD = 0.5;

// Inline copy of src/lib/normalize.ts so this script stays a plain .mjs.
// Use explicit \u escapes — the literal-char ranges in the original file
// rely on careful typing (ؚ vs ٚ are visually similar); escapes
// remove the ambiguity.
//   ؐ-ؚ: Quranic honorifics (ؐ ـ ؚ)
//   ً-ٟ: harakat / tanwin / shadda / sukun / Quranic marks
//   ٰ     : superscript alef (ٰ)
//   ـ     : tatweel (ـ)
const STRIP = /[ؐ-ًؚ-ٰٟـ]/g;
const FOLD_MAP = { "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه" };
function normalizeArabic(s) {
  return s.normalize("NFC")
    .replace(STRIP, "")
    .replace(/[أإآٱىة]/g, (ch) => FOLD_MAP[ch] ?? ch)
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  const lines = (await fs.readFile(ENTRIES_FILE, "utf8")).split("\n").filter((l) => l.trim());
  console.log(`loaded ${lines.length} verdicts`);

  // Concurrent workers. Each grabs a pooled connection, sets per-session
  // similarity_threshold for its trgm query, runs the match + insert, then
  // releases. ~8 in-flight × ~250ms per query (with index) ≈ 50/sec.
  const CONCURRENCY = 8;
  const queue = lines.slice();
  let inserted = 0, dup = 0, unmatched = 0;
  const unmatchedRows = [];
  const t0 = Date.now();

  async function worker() {
    while (queue.length > 0) {
      const line = queue.shift();
      if (!line) break;
      const e = JSON.parse(line);
      const normalized = normalizeArabic(e.narrator_name);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL pg_trgm.similarity_threshold = 0.4");
        const candidates = await client.query(
          `SELECT n.id, n.full_name, max(similarity(nv.normalized_variant, $1)) AS score
           FROM name_variant nv JOIN narrator n ON n.id = nv.narrator_id
           WHERE nv.normalized_variant % $1
           GROUP BY n.id, n.full_name ORDER BY score DESC LIMIT 3`,
          [normalized],
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
            top_candidates: candidates.rows.map((c) => ({ id: c.id, name: c.full_name.slice(0, 60), score: Number(c.score) })),
          });
        } else {
          const r = await client.query(
            `INSERT INTO narrator_grade_source
               (narrator_id, source_book, author_ar, verdict_ar, relayed_via, page_ref, raw_entry, match_score)
             VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6)
             ON CONFLICT (narrator_id, source_book, md5(verdict_ar)) DO NOTHING RETURNING id`,
            [pick.id, SOURCE_BOOK, AUTHOR_AR, e.verdict_ar, e.raw_entry, Number(pick.score)],
          );
          if (r.rowCount > 0) inserted++; else dup++;
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("worker err:", err.message);
      } finally {
        client.release();
      }
      const t = inserted + dup + unmatched;
      if (t % 200 === 0 && t > 0) {
        const rate = t / ((Date.now() - t0) / 1000);
        console.log(`  ${t}/${lines.length} — inserted=${inserted} dup=${dup} unmatched=${unmatched} (${rate.toFixed(1)}/s)`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const writer = await pool.connect();
  await writer.query(
    `INSERT INTO source_import_log (source_book, total_entries, matched, unmatched, last_run_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (source_book) DO UPDATE SET total_entries=$2, matched=$3, unmatched=$4, last_run_at=now()`,
    [SOURCE_BOOK, lines.length, inserted + dup, unmatched],
  );
  writer.release();
  await fs.writeFile(UNMATCHED_FILE, unmatchedRows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  console.log(`\nDONE: ${inserted} inserted, ${dup} dup, ${unmatched} unmatched in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
