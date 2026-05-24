// Import Ibn Hajar's Tabaqat al-Mudallisin into narrator.tadlis_tier.
// Each entry is name-matched to a narrator via trigram similarity using the
// same local-trigram engine we used for AR-Sanad death years.

import fs from "node:fs";
import { pool, query } from "../src/lib/db";
import { normalizeArabic } from "../src/lib/normalize";

const JSON_PATH = "data/mudallisin.json";
const MIN_SIM = 0.82; // slightly more permissive than the AR-Sanad cutoff
                     //  because the curated names use canonical short forms

interface Entry {
  tier: number;
  name_ar: string;
  note: string;
}

interface MudallisFile {
  narrators: Entry[];
}

function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const word of s.trim().split(/\s+/)) {
    if (word.length === 0) continue;
    const padded = "  " + word + " ";
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

function sim(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

async function main() {
  const t0 = Date.now();
  const data: MudallisFile = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));
  console.log(`mudallisin: ${data.narrators.length} entries`);

  // Pull eligible name_variants ONCE. We don't filter by "no existing tier"
  // because we want to UPDATE-on-match: re-running this script is idempotent.
  console.log("pulling all name_variants...");
  const variants = await query<{ narrator_id: number; normalized_variant: string }>(
    `SELECT nv.narrator_id, nv.normalized_variant FROM name_variant nv`,
  );
  console.log(`  ${variants.rows.length} variants`);

  console.log("building inverted trigram index...");
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

  // For each mudallis entry, find best matching narrator.
  console.log("matching mudallisin to narrator ids...");
  const writes: { narratorId: number; tier: number; entry: Entry; score: number }[] = [];
  const unmatched: Entry[] = [];
  for (const e of data.narrators) {
    const inp = trigrams(normalizeArabic(e.name_ar));
    const counts = new Map<number, number>();
    for (const t of inp) {
      const arr = trigramTo.get(t);
      if (!arr) continue;
      for (const vi of arr) counts.set(vi, (counts.get(vi) ?? 0) + 1);
    }
    let bestId = -1;
    let bestScore = 0;
    for (const [vi, inter] of counts) {
      const union = inp.size + totalGrams[vi] - inter;
      if (union === 0) continue;
      const score = inter / union;
      if (score > bestScore) {
        bestScore = score;
        bestId = narratorId[vi];
      }
    }
    if (bestScore >= MIN_SIM && bestId >= 0) {
      writes.push({ narratorId: bestId, tier: e.tier, entry: e, score: bestScore });
    } else {
      unmatched.push(e);
    }
  }
  console.log(`  matched: ${writes.length}, unmatched: ${unmatched.length}`);

  // Dedupe writes — keep highest score per narrator_id; conflicts go to lowest tier
  // (the more dangerous classification).
  const byNarrator = new Map<number, typeof writes[0]>();
  for (const w of writes) {
    const cur = byNarrator.get(w.narratorId);
    if (!cur || w.tier > cur.tier) byNarrator.set(w.narratorId, w);
  }
  const final = Array.from(byNarrator.values());

  // Bulk UPDATE.
  console.log("writing tadlis_tier...");
  const upd = await query<{ updated: string }>(
    `WITH inputs AS (
       SELECT unnest($1::int[]) AS id, unnest($2::int[]) AS tier
     ),
     updated AS (
       UPDATE narrator SET tadlis_tier = i.tier
       FROM inputs i WHERE narrator.id = i.id
       RETURNING narrator.id
     )
     SELECT count(*)::text AS updated FROM updated`,
    [final.map((f) => f.narratorId), final.map((f) => f.tier)],
  );
  console.log(`  UPDATE: ${upd.rows[0].updated} narrators tagged`);

  // Show the matches.
  console.log("\n--- matches ---");
  for (const f of final.slice(0, 15)) {
    console.log(
      `  tier=${f.tier} (sim=${f.score.toFixed(2)}) id=${f.narratorId} → ${f.entry.name_ar}`,
    );
  }
  if (final.length > 15) console.log(`  ... and ${final.length - 15} more`);

  if (unmatched.length > 0) {
    console.log("\n--- unmatched (no narrator above similarity floor) ---");
    for (const u of unmatched) console.log(`  tier=${u.tier} ${u.name_ar}`);
  }

  console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
