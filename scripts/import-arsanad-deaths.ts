// Import death years from AR-Sanad 280K (somaia02/Narrator-Disambiguation) into
// the `narrator.death_overlay` column. Itqan is missing death years for ~68%
// of narrators; AR-Sanad has them for ~9.4k. We fill the gap.
//
// Strategy: process AR-Sanad rows in client-side batches. Each batch sends one
// SQL statement that does the LATERAL trigram match AND the UPDATE in a single
// CTE for that batch only. This gives us progress logs per batch and avoids
// the huge single-LATERAL query that hangs on Neon's free tier.
//
// Re-run-safe: only writes to narrators whose `death` AND `death_overlay`
// are both empty.

import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { query, pool } from "../src/lib/db";
import { normalizeArabic } from "../src/lib/normalize";

const CSV_PATH = "data/arsanad/narrators.csv";
const MIN_SIM = 0.85;
const BATCH = 250;

interface ArSanadRow {
  name: string;
  death_year: string;
}

async function processBatch(
  batch: { normalized: string; death: string }[],
): Promise<number> {
  // One CTE per batch:
  //  inputs  → unnest the parallel arrays
  //  matches → LATERAL: top-1 narrator per input row above MIN_SIM
  //  picks   → keep highest-score match per narrator_id, filter eligibility
  //  return: number of UPDATEs made
  const res = await query<{ written: string }>(
    `
    WITH inputs AS (
      SELECT unnest($1::text[]) AS normalized,
             unnest($2::text[]) AS death
    ),
    matches AS (
      SELECT i.death, m.narrator_id, m.score
      FROM inputs i
      CROSS JOIN LATERAL (
        SELECT nv.narrator_id,
               max(similarity(nv.normalized_variant, i.normalized)) AS score
        FROM name_variant nv
        WHERE nv.normalized_variant % i.normalized
        GROUP BY nv.narrator_id
        ORDER BY score DESC
        LIMIT 1
      ) m
      WHERE m.score >= $3
    ),
    picks AS (
      SELECT DISTINCT ON (m.narrator_id) m.narrator_id, m.death
      FROM matches m
      JOIN narrator n ON n.id = m.narrator_id
      WHERE (n.death IS NULL OR n.death = '-' OR n.death = '')
        AND (n.death_overlay IS NULL OR n.death_overlay = '')
        AND EXISTS (SELECT 1 FROM source_grade sg WHERE sg.narrator_id = n.id)
      ORDER BY m.narrator_id, m.score DESC
    ),
    updated AS (
      UPDATE narrator
      SET death_overlay = p.death
      FROM picks p
      WHERE narrator.id = p.narrator_id
      RETURNING narrator.id
    )
    SELECT count(*)::text AS written FROM updated
    `,
    [batch.map((r) => r.normalized), batch.map((r) => r.death), MIN_SIM],
  );
  return Number(res.rows[0].written);
}

async function main() {
  console.log(`reading ${CSV_PATH}...`);
  const buf = fs.readFileSync(CSV_PATH);
  const rows: ArSanadRow[] = parse(buf, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
  });

  const usable = rows
    .map((r) => ({
      name: r.name?.trim() ?? "",
      death: r.death_year?.trim() ?? "",
    }))
    .filter((r) => r.name.length > 0 && r.death.length > 0 && r.death !== "-")
    .map((r) => ({
      normalized: normalizeArabic(r.name),
      death: r.death,
    }))
    .filter((r) => r.normalized.length > 0);

  // De-duplicate normalized names.
  const dedup = new Map<string, string>();
  for (const r of usable) if (!dedup.has(r.normalized)) dedup.set(r.normalized, r.death);
  const inputs = Array.from(dedup, ([normalized, death]) => ({ normalized, death }));

  console.log(
    `AR-Sanad rows: ${rows.length}, usable: ${usable.length}, unique normalized: ${inputs.length}`,
  );

  let totalWritten = 0;
  const t0 = Date.now();
  for (let i = 0; i < inputs.length; i += BATCH) {
    const slice = inputs.slice(i, i + BATCH);
    const batchT0 = Date.now();
    const written = await processBatch(slice);
    totalWritten += written;
    const batchSec = ((Date.now() - batchT0) / 1000).toFixed(1);
    const totalSec = ((Date.now() - t0) / 1000).toFixed(0);
    const eta = (
      ((Date.now() - t0) / (i + slice.length)) *
      (inputs.length - i - slice.length) /
      1000
    ).toFixed(0);
    console.log(
      `  batch ${i + slice.length}/${inputs.length}  +${written}  ` +
        `total=${totalWritten}  (${batchSec}s, elapsed ${totalSec}s, eta ${eta}s)`,
    );
  }

  console.log(`\ndone. newly written overlays: ${totalWritten}`);

  const cov = await query<{ kind: string; c: string }>(`
    SELECT 'total'        AS kind, count(*)::text AS c FROM narrator
    UNION ALL
    SELECT 'with_death',   count(*)::text       FROM narrator WHERE death IS NOT NULL AND death <> '-' AND death <> ''
    UNION ALL
    SELECT 'with_overlay', count(*)::text       FROM narrator WHERE death_overlay IS NOT NULL AND death_overlay <> ''
    UNION ALL
    SELECT 'either',       count(*)::text       FROM narrator WHERE (death IS NOT NULL AND death <> '-' AND death <> '') OR (death_overlay IS NOT NULL AND death_overlay <> '')
  `);
  console.log("\nfinal coverage:");
  for (const r of cov.rows) console.log(`  ${r.kind.padEnd(14)} ${r.c}`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
