import { createHash } from "node:crypto";
import { query } from "../db";
import { normalizeArabic } from "../normalize";
import type { MatchResult } from "./matcher";

// Bump this whenever the MatchResult shape OR the verdict policy changes,
// so old cached rows are skipped on the next request.
//   v1 — original
//   v2 — added attested links, cooccurrence, formula, geo, harshest-grade policy
//   v3 — segmenter now handles «ح» (taḥwīl) marker correctly
//   v4 — Companion carve-out applied to harshest_grade_en and disagreement
//   v5 — segmenter resolves «قالا» multi-compiler + «أبيه/جده» relative refs
//   v6 — segmenter preserves disambiguating attrs (مولى X, الأنصاري, الكوفي…)
const CACHE_VERSION = "v6";

/** Stable cache key for a pasted isnād. Includes a policy version so that
 *  shape/verdict changes auto-invalidate without manual cache wipes. */
export function inputHash(rawText: string): string {
  return createHash("sha256")
    .update(CACHE_VERSION + ":" + normalizeArabic(rawText))
    .digest("hex");
}

export async function getCached(hash: string): Promise<MatchResult | null> {
  const res = await query<{ result: MatchResult }>(
    "SELECT result FROM match_cache WHERE input_hash = $1",
    [hash],
  );
  return res.rows[0]?.result ?? null;
}

export async function setCached(
  hash: string,
  result: MatchResult,
): Promise<void> {
  await query(
    `INSERT INTO match_cache (input_hash, result) VALUES ($1, $2)
     ON CONFLICT (input_hash) DO UPDATE
       SET result = $2, created_at = now()`,
    [hash, JSON.stringify(result)],
  );
}
