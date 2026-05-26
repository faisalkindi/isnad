// Recover unmatched entries via token-Jaccard fuzzy match.
// Mirrors the dedup logic from chain-align.ts so we use the SAME identity
// model: strip honorifics + nisba suffixes, compare key tokens.

import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import pg from "pg";

const NAME_NOISE = new Set([
  "ابن", "بن", "بنت", "ابو", "ابي", "ام",
  "امير", "المؤمنين", "حفص",
  "ال", "الامام",
  "رضي", "الله", "عنه", "عنها", "عنهم", "تعالى",
  "سيدنا", "مولانا", "حضرت",
  "او", "أو",
]);
const NISBA_RX = /^(الليثي|الانصاري|التيمي|الكلابي|الاشعري|القرشي|الكوفي|البصري|المدني|الشامي|الدمشقي|البغدادي|الحميدي|الازدي|التميمي|الخزاعي|الثقفي|السلمي|الجمحي|الفارسي|الحارثي|الهمذاني|الواسطي|المخزومي|الزهري|العدوي|الجعفي|الفزاري|الباهلي|الفهري|الكناني)$/;

function nameTokens(name) {
  const stripDia = name.normalize("NFC").replace(/[ؐ-ًؚ-ٰٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
  return stripDia.split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2 && !NAME_NOISE.has(t) && !NISBA_RX.test(t));
}

function jaccard(a, b) {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a), sb = new Set(b);
  const inter = [...sa].filter((t) => sb.has(t)).length;
  const uni = new Set([...sa, ...sb]).size;
  return inter / uni;
}

function isSubset(small, large) {
  if (small.length < 2) return false;
  const slarge = new Set(large);
  return small.every((t) => slarge.has(t));
}

async function recoverFor(client, jobs) {
  const SOURCE_BOOK = jobs.sourceBook;
  const AUTHOR_AR = jobs.authorAr;
  const file = jobs.unmatchedFile;
  if (!existsSync(file)) {
    console.log(`no unmatched file at ${file}`);
    return;
  }
  const lines = (await fs.readFile(file, "utf8")).split("\n").filter((l) => l.trim());
  console.log(`\n--- ${SOURCE_BOOK}: ${lines.length} unmatched ---`);

  // Load all entries to pair name+verdict (unmatched.jsonl has only name + top candidates)
  const entriesFile = file.replace("_unmatched", "_entries");
  const allEntries = new Map();
  for (const l of (await fs.readFile(entriesFile, "utf8")).split("\n").filter((x) => x.trim())) {
    const e = JSON.parse(l);
    allEntries.set(e.entry_num + "::" + e.narrator_name, e);
  }

  let recovered = 0;
  let stillUnmatched = 0;

  for (const line of lines) {
    const u = JSON.parse(line);
    const key = u.entry_num + "::" + u.narrator_name;
    const entry = allEntries.get(key);
    if (!entry) {
      stillUnmatched++;
      continue;
    }
    const queryTokens = nameTokens(u.narrator_name);
    if (queryTokens.length === 0) {
      stillUnmatched++;
      continue;
    }
    // Search for narrators whose name shares ≥2 tokens with the query.
    // We use a pg_trgm pre-filter at very loose 0.2, then refine in JS.
    const candidates = await client.query(
      `SELECT id, full_name FROM narrator
       WHERE full_name % $1
       ORDER BY similarity(full_name, $1) DESC
       LIMIT 30`,
      [u.narrator_name],
    );
    let best = null;
    let bestScore = 0;
    for (const c of candidates.rows) {
      const ct = nameTokens(c.full_name);
      if (ct.length === 0) continue;
      const j = jaccard(queryTokens, ct);
      const sub = isSubset(queryTokens, ct) || isSubset(ct, queryTokens);
      const score = Math.max(j, sub ? 0.65 : 0);
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        best = c;
      }
    }
    if (!best) {
      stillUnmatched++;
      continue;
    }
    const r = await client.query(
      `INSERT INTO narrator_grade_source
         (narrator_id, source_book, author_ar, verdict_ar, relayed_via, page_ref, raw_entry, match_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (narrator_id, source_book, md5(verdict_ar)) DO NOTHING
       RETURNING id`,
      [best.id, SOURCE_BOOK, AUTHOR_AR, entry.verdict_ar, entry.relayed_via ?? null, entry.page_ref ?? null, entry.raw_entry, bestScore],
    );
    if (r.rowCount > 0) recovered++;
  }
  console.log(`  recovered: ${recovered}, still unmatched: ${stillUnmatched}`);
  return recovered;
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL pg_trgm.similarity_threshold = 0.2");

  await recoverFor(client, {
    sourceBook: "daraqutni_mawsuah",
    authorAr: "الدارقطني",
    unmatchedFile: "data/daraqutni_mawsuah/_unmatched.jsonl",
  });
  await recoverFor(client, {
    sourceBook: "ibn_hibban_majruhin",
    authorAr: "ابن حبان",
    unmatchedFile: "data/ibn_hibban_majruhin/_unmatched.jsonl",
  });

  await client.query("COMMIT");
  await client.end();
  console.log("\nDONE");
}

main().catch((e) => { console.error(e); process.exit(1); });
