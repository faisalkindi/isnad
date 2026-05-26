// Jaccard-fuzzy recovery for unmatched al-Ijli entries. Uses normalized
// token-set overlap to catch names that trgm missed (tashkeel variants,
// extra honorifics, nisba differences).
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import pg from "pg";

const ENTRIES_FILE = "data/ijli_thiqat/_entries.jsonl";
const UNMATCHED_FILE = "data/ijli_thiqat/_unmatched.jsonl";
const SOURCE_BOOK = "ijli_thiqat";
const AUTHOR_AR = "العجلي";

const STRIP = /[ؐ-ًؚ-ٰٟـ]/g;
const FOLD = { "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه" };
function normalize(s) {
  return s.normalize("NFC").replace(STRIP, "").replace(/[أإآٱىة]/g, (c) => FOLD[c] ?? c).replace(/\s+/g, " ").trim();
}

const NAME_NOISE = new Set([
  "ابن", "بن", "بنت", "ابو", "ابي", "ام",
  "ال", "الامام",
  "رضي", "الله", "عنه", "عنها", "عنهم", "تعالى",
  "او", "أو",
  "ثقه", "ضعيف", "صدوق", "متروك", "كذاب",  // verdict tokens left in name
  "كوفي", "بصري", "مدني", "شامي",            // city-only nisbas
  "تابعي", "صحابي",
]);
const NISBA_RX = /^(الليثي|الانصاري|التيمي|الكلابي|الاشعري|القرشي|الكوفي|البصري|المدني|الشامي|الدمشقي|البغدادي|الحميدي|الازدي|التميمي|الخزاعي|الثقفي|السلمي|الجمحي|الفارسي|الحارثي|الهمذاني|الواسطي|المخزومي|الزهري|العدوي|الجعفي|الفزاري|الباهلي|الفهري|الكناني)$/;

function tokens(name) {
  return normalize(name).split(/\s+/).filter((t) => t.length >= 2 && !NAME_NOISE.has(t) && !NISBA_RX.test(t));
}

function jaccard(a, b) {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a), sb = new Set(b);
  const inter = [...sa].filter((t) => sb.has(t)).length;
  return inter / new Set([...sa, ...sb]).size;
}

async function main() {
  if (!existsSync(UNMATCHED_FILE)) { console.log("no unmatched file"); return; }
  const unmatched = (await fs.readFile(UNMATCHED_FILE, "utf8")).split("\n").filter((l) => l.trim()).map(JSON.parse);
  const allEntries = new Map();
  for (const l of (await fs.readFile(ENTRIES_FILE, "utf8")).split("\n").filter((x) => x.trim())) {
    const e = JSON.parse(l);
    allEntries.set(e.entry_num + "::" + e.narrator_name, e);
  }
  console.log(`processing ${unmatched.length} unmatched entries`);

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  let recovered = 0;
  let stillUnmatched = 0;
  const t0 = Date.now();

  const queue = unmatched.slice();
  async function worker() {
    while (queue.length > 0) {
      const u = queue.shift();
      if (!u) break;
      const entry = allEntries.get(u.entry_num + "::" + u.narrator_name);
      if (!entry) { stillUnmatched++; continue; }
      const qTokens = tokens(u.narrator_name);
      if (qTokens.length === 0) { stillUnmatched++; continue; }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL pg_trgm.similarity_threshold = 0.25");
        const r = await client.query(
          `SELECT n.id, n.full_name FROM name_variant nv
           JOIN narrator n ON n.id = nv.narrator_id
           WHERE nv.normalized_variant % $1
           LIMIT 30`,
          [normalize(u.narrator_name)],
        );
        let best = null;
        let bestScore = 0;
        for (const c of r.rows) {
          const ct = tokens(c.full_name);
          if (ct.length === 0) continue;
          const j = jaccard(qTokens, ct);
          if (j > bestScore && j >= 0.5) { bestScore = j; best = c; }
        }
        if (best) {
          const ins = await client.query(
            `INSERT INTO narrator_grade_source (narrator_id, source_book, author_ar, verdict_ar, raw_entry, match_score)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (narrator_id, source_book, md5(verdict_ar)) DO NOTHING RETURNING id`,
            [best.id, SOURCE_BOOK, AUTHOR_AR, entry.verdict_ar, entry.raw_entry, bestScore],
          );
          if (ins.rowCount > 0) recovered++; else stillUnmatched++;
        } else stillUnmatched++;
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        stillUnmatched++;
      } finally {
        client.release();
      }
      const t = recovered + stillUnmatched;
      if (t % 100 === 0 && t > 0) {
        const rate = t / ((Date.now() - t0) / 1000);
        console.log(`  ${t}/${unmatched.length} — recovered=${recovered} unmatched=${stillUnmatched} (${rate.toFixed(1)}/s)`);
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, () => worker()));
  console.log(`\nDONE: recovered ${recovered}, still unmatched ${stillUnmatched}`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
