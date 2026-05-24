// Import city data from AR-Sanad into narrator.cities_overlay using the same
// local-trigram match engine we used for death years.

import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { pool, query } from "../src/lib/db";
import { normalizeArabic } from "../src/lib/normalize";

const CSV_PATH = "data/arsanad/narrators.csv";
const MIN_SIM = 0.85;

interface ArSanadRow {
  name: string;
  living_city: string;
  journey_city: string;
  death_city: string;
}

function combineCities(r: ArSanadRow): string {
  const parts: string[] = [];
  for (const f of [r.living_city, r.journey_city, r.death_city]) {
    if (!f || f === "-") continue;
    for (const c of f.split(/[،,;]+/)) {
      const t = c.trim();
      if (t && t !== "-") parts.push(t);
    }
  }
  // Dedupe preserving order.
  const seen = new Set<string>();
  return parts.filter((c) => (seen.has(c) ? false : (seen.add(c), true))).join(
    "، ",
  );
}

function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.trim().split(/\s+/)) {
    if (!w) continue;
    const padded = "  " + w + " ";
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

async function main() {
  const t0 = Date.now();
  const buf = fs.readFileSync(CSV_PATH);
  const rows: ArSanadRow[] = parse(buf, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
  });

  const dedup = new Map<string, string>();
  for (const r of rows) {
    const name = (r.name ?? "").trim();
    if (!name) continue;
    const cities = combineCities(r);
    if (!cities) continue;
    const normalized = normalizeArabic(name);
    if (!normalized) continue;
    if (!dedup.has(normalized)) dedup.set(normalized, cities);
  }
  const inputs = Array.from(dedup, ([normalized, cities]) => ({
    normalized,
    cities,
    grams: trigrams(normalized),
  }));
  console.log(`AR-Sanad rows with cities: ${inputs.length}`);

  console.log("pulling eligible name_variants from Neon...");
  const variants = await query<{ narrator_id: number; normalized_variant: string }>(`
    SELECT nv.narrator_id, nv.normalized_variant
    FROM name_variant nv
    WHERE EXISTS (
      SELECT 1 FROM narrator n WHERE n.id = nv.narrator_id
        AND (n.cities_overlay IS NULL OR n.cities_overlay = '')
        AND (n.city IS NULL OR n.city = '-' OR n.city = '')
        AND EXISTS (SELECT 1 FROM source_grade sg WHERE sg.narrator_id = n.id)
    )
  `);
  console.log(`  ${variants.rows.length} variants`);

  console.log("building trigram index...");
  const totalGrams = new Int16Array(variants.rows.length);
  const narratorId = new Int32Array(variants.rows.length);
  const trigramTo = new Map<string, number[]>();
  variants.rows.forEach((v, i) => {
    narratorId[i] = v.narrator_id;
    const g = trigrams(v.normalized_variant);
    totalGrams[i] = g.size;
    for (const t of g) {
      let arr = trigramTo.get(t);
      if (!arr) trigramTo.set(t, (arr = []));
      arr.push(i);
    }
  });

  console.log("matching...");
  const writes = new Map<number, { cities: string; score: number }>();
  let matched = 0;
  const counts = new Map<number, number>();
  for (const inp of inputs) {
    counts.clear();
    for (const t of inp.grams) {
      const arr = trigramTo.get(t);
      if (!arr) continue;
      for (const vi of arr) counts.set(vi, (counts.get(vi) ?? 0) + 1);
    }
    let bestN = -1;
    let bestScore = 0;
    for (const [vi, inter] of counts) {
      const union = inp.grams.size + totalGrams[vi] - inter;
      if (union === 0) continue;
      const score = inter / union;
      if (score > bestScore) {
        bestScore = score;
        bestN = narratorId[vi];
      }
    }
    if (bestScore >= MIN_SIM && bestN >= 0) {
      matched++;
      const prior = writes.get(bestN);
      if (!prior || prior.score < bestScore) {
        writes.set(bestN, { cities: inp.cities, score: bestScore });
      }
    }
  }
  console.log(`  matches above ${MIN_SIM}: ${matched}, unique narrators: ${writes.size}`);

  console.log("bulk UPDATE...");
  const ids: number[] = [];
  const cs: string[] = [];
  for (const [id, w] of writes) {
    ids.push(id);
    cs.push(w.cities);
  }
  const upd = await query<{ written: string }>(
    `WITH inputs AS (
       SELECT unnest($1::int[]) AS id, unnest($2::text[]) AS cities
     ),
     updated AS (
       UPDATE narrator SET cities_overlay = i.cities
       FROM inputs i WHERE narrator.id = i.id
         AND (narrator.cities_overlay IS NULL OR narrator.cities_overlay = '')
       RETURNING narrator.id
     )
     SELECT count(*)::text AS written FROM updated`,
    [ids, cs],
  );
  console.log(`  ${upd.rows[0].written} narrators received cities_overlay`);

  const cov = await query<{ kind: string; c: string }>(`
    SELECT 'total' AS kind, count(*)::text AS c FROM narrator
    UNION ALL SELECT 'with_itqan_city', count(*)::text FROM narrator WHERE city IS NOT NULL AND city <> '-' AND city <> ''
    UNION ALL SELECT 'with_overlay',   count(*)::text FROM narrator WHERE cities_overlay IS NOT NULL AND cities_overlay <> ''
    UNION ALL SELECT 'either',          count(*)::text FROM narrator WHERE (city IS NOT NULL AND city <> '-' AND city <> '') OR (cities_overlay IS NOT NULL AND cities_overlay <> '')
  `);
  console.log(`\nfinal coverage (${((Date.now() - t0) / 1000).toFixed(1)}s):`);
  for (const r of cov.rows) console.log(`  ${r.kind.padEnd(18)} ${r.c}`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
