// Local-trigram version of the AR-Sanad death-year importer.
//
// Why local: Neon's free-tier round-trip is ~640ms. The previous server-side
// LATERAL trigram approach made one round-trip per batch, and each batch with
// 250 inputs cost ~2 minutes of trigram work on Neon's small compute. Total
// runtime was ~70 minutes.
//
// This version:
//   1. Pulls all ELIGIBLE name_variant rows once (narrator must have no
//      existing death and at least one source_grade row — the same eligibility
//      gate the server version applied).
//   2. Builds an in-memory inverted trigram index.
//   3. For each AR-Sanad name, accumulates trigram-overlap counts against the
//      index and picks the highest-scoring narrator.
//   4. Sends one bulk UPDATE.
//
// Total: 2 DB round-trips plus pure CPU work. Expected runtime: ~2 minutes.
//
// We implement pg_trgm's trigram algorithm faithfully:
//   - each word in the input is wrapped with two leading spaces and one
//     trailing space, then split into all 3-character substrings.
//   - similarity = |A ∩ B| / |A ∪ B|.
// So the MIN_SIM threshold means the same thing it did server-side.

import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { pool, query } from "../src/lib/db";
import { normalizeArabic } from "../src/lib/normalize";

const CSV_PATH = "data/arsanad/narrators.csv";
const MIN_SIM = 0.85;

/** pg_trgm-compatible trigrams of an already-normalized Arabic string. */
function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const word of s.trim().split(/\s+/)) {
    if (word.length === 0) continue;
    const padded = "  " + word + " ";
    for (let i = 0; i + 3 <= padded.length; i++) {
      out.add(padded.slice(i, i + 3));
    }
  }
  return out;
}

interface ArSanadInput {
  normalized: string;
  death: string;
  grams: Set<string>;
}

async function main() {
  const t0 = Date.now();

  // ---- 1. Read AR-Sanad CSV ----
  console.log(`reading ${CSV_PATH}...`);
  const buf = fs.readFileSync(CSV_PATH);
  const rows: { name: string; death_year: string }[] = parse(buf, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
  });
  const dedup = new Map<string, string>();
  for (const r of rows) {
    const name = (r.name ?? "").trim();
    const death = (r.death_year ?? "").trim();
    if (!name || !death || death === "-") continue;
    const normalized = normalizeArabic(name);
    if (!normalized) continue;
    if (!dedup.has(normalized)) dedup.set(normalized, death);
  }
  const inputs: ArSanadInput[] = Array.from(dedup, ([normalized, death]) => ({
    normalized,
    death,
    grams: trigrams(normalized),
  }));
  console.log(
    `AR-Sanad: ${rows.length} rows, ${inputs.length} unique normalized names with death.`,
  );

  // ---- 2. Pull eligible name_variants ----
  console.log("pulling eligible name_variants from Neon (one query)...");
  const pullT = Date.now();
  const variants = await query<{ narrator_id: number; normalized_variant: string }>(`
    SELECT nv.narrator_id, nv.normalized_variant
    FROM name_variant nv
    WHERE EXISTS (
      SELECT 1 FROM narrator n
      WHERE n.id = nv.narrator_id
        AND (n.death IS NULL OR n.death = '-' OR n.death = '')
        AND (n.death_overlay IS NULL OR n.death_overlay = '')
        AND EXISTS (SELECT 1 FROM source_grade sg WHERE sg.narrator_id = n.id)
    )
  `);
  console.log(
    `  ${variants.rows.length} variants pulled in ${((Date.now() - pullT) / 1000).toFixed(1)}s`,
  );

  // ---- 3. Build inverted trigram index ----
  console.log("building inverted trigram index...");
  const idxT = Date.now();
  const variantTotalGrams = new Int16Array(variants.rows.length);
  const variantNarratorId = new Int32Array(variants.rows.length);
  const trigramToVariants = new Map<string, number[]>();

  variants.rows.forEach((v, i) => {
    variantNarratorId[i] = v.narrator_id;
    const g = trigrams(v.normalized_variant);
    variantTotalGrams[i] = g.size;
    for (const t of g) {
      let arr = trigramToVariants.get(t);
      if (!arr) {
        arr = [];
        trigramToVariants.set(t, arr);
      }
      arr.push(i);
    }
  });
  console.log(
    `  ${trigramToVariants.size} unique trigrams indexed in ` +
      `${((Date.now() - idxT) / 1000).toFixed(1)}s`,
  );

  // ---- 4. Match each AR-Sanad input against the index ----
  console.log("matching...");
  const matchT = Date.now();
  // Final writes: per narrator_id, the best (highest-similarity) AR-Sanad death.
  const writes = new Map<number, { death: string; score: number }>();
  let matchedCount = 0;

  const counts = new Map<number, number>(); // reuse, cleared per input
  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i];
    counts.clear();
    for (const t of inp.grams) {
      const arr = trigramToVariants.get(t);
      if (!arr) continue;
      for (const vi of arr) counts.set(vi, (counts.get(vi) ?? 0) + 1);
    }
    let bestNarrator = -1;
    let bestScore = 0;
    const inpSize = inp.grams.size;
    for (const [vi, inter] of counts) {
      const union = inpSize + variantTotalGrams[vi] - inter;
      if (union === 0) continue;
      const score = inter / union;
      if (score > bestScore) {
        bestScore = score;
        bestNarrator = variantNarratorId[vi];
      }
    }
    if (bestScore >= MIN_SIM && bestNarrator >= 0) {
      matchedCount++;
      const prior = writes.get(bestNarrator);
      if (!prior || prior.score < bestScore) {
        writes.set(bestNarrator, { death: inp.death, score: bestScore });
      }
    }
    if ((i + 1) % 1000 === 0) {
      console.log(
        `  ${i + 1}/${inputs.length}  matched=${matchedCount}  ` +
          `(${((Date.now() - matchT) / 1000).toFixed(1)}s)`,
      );
    }
  }
  console.log(
    `match phase done: ${matchedCount} matches → ${writes.size} unique narrators to update ` +
      `in ${((Date.now() - matchT) / 1000).toFixed(1)}s`,
  );

  // ---- 5. Bulk UPDATE ----
  if (writes.size > 0) {
    console.log("writing overlays (single UPDATE)...");
    const writeT = Date.now();
    const ids: number[] = [];
    const deaths: string[] = [];
    for (const [id, w] of writes) {
      ids.push(id);
      deaths.push(w.death);
    }
    const upd = await query<{ written: string }>(
      `
      WITH inputs AS (
        SELECT unnest($1::int[]) AS id, unnest($2::text[]) AS death
      ),
      updated AS (
        UPDATE narrator SET death_overlay = i.death
        FROM inputs i
        WHERE narrator.id = i.id
          AND (narrator.death IS NULL OR narrator.death = '-' OR narrator.death = '')
          AND (narrator.death_overlay IS NULL OR narrator.death_overlay = '')
        RETURNING narrator.id
      )
      SELECT count(*)::text AS written FROM updated
      `,
      [ids, deaths],
    );
    console.log(
      `  UPDATE returned ${upd.rows[0].written} rows in ` +
        `${((Date.now() - writeT) / 1000).toFixed(1)}s`,
    );
  }

  // ---- 6. Final coverage ----
  const cov = await query<{ kind: string; c: string }>(`
    SELECT 'total'        AS kind, count(*)::text AS c FROM narrator
    UNION ALL
    SELECT 'with_death',   count(*)::text       FROM narrator WHERE death IS NOT NULL AND death <> '-' AND death <> ''
    UNION ALL
    SELECT 'with_overlay', count(*)::text       FROM narrator WHERE death_overlay IS NOT NULL AND death_overlay <> ''
    UNION ALL
    SELECT 'either',       count(*)::text       FROM narrator WHERE (death IS NOT NULL AND death <> '-' AND death <> '') OR (death_overlay IS NOT NULL AND death_overlay <> '')
  `);
  console.log(`\nfinal coverage (total runtime ${((Date.now() - t0) / 1000).toFixed(1)}s):`);
  for (const r of cov.rows) console.log(`  ${r.kind.padEnd(14)} ${r.c}`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
