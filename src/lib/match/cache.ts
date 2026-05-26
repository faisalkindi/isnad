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
//   v7 — nisbah classification (مرفوع/موقوف/مقطوع/قدسي); Prophet appended only
//        when actually raised to him; verdict reason reflects ascription
//   v8 — chain-level tadlīs types (تدليس الإسناد / تدليس التسوية) detected
//        from chain narrators + formula
//   v9  — number-class, saqṭ type, refined rank, maqbūl/mardūd, asbāb al-ṭaʿn
//   v10 — number-class now uses the CLASSICAL rule (per-طبقة distinct-student
//         counts via our transmission graph), not corpus match counts
//   v11 — multi-branch isnād support (BranchResult[] + iʿtibār note) for
//         «ح» / «وعن X» pivot-forks; segmenter returns branches[].
//   v12 — attestation evidence on links: source_books[], documented_non_meeting,
//         attestation_verb (samaa/liqa/idraka/rawa/kataba).
//   v13 — invalidate v12 cache entries computed before al-Tarikh al-Kabir
//         ingestion completed (7,594 attestation_verb rows now loaded).
//   v14 — book key → Arabic title mapping now uses canonical lib/sources;
//         Prophet→Companion link rendered as clean ṣuḥba note.
//   v15 — verdict layout restructured to prototype: tier-row key-val pairs +
//         ✓/✗ checklist for the 5 classical conditions of ḥadīth ṣaḥīḥ.
//   v16 — غرابة (number-class) reason now walks narrator-by-narrator
//         ("تفرّد به X عن Y، ثم تفرّد به A عن B…") instead of dumping the
//         level-summary digits.
//   v17 — matn-only inputs (no isnād) no longer throw; return corpus matches
//         + needs_review verdict so user can re-audit using a book's chain.
//   v18 — accordion content rewritten to prototype's narrative style:
//         TadlisPanel uses mudallis-tier prose + samaa-confirmation,
//         RuleFooter replaced with numbered methodology list.
const CACHE_VERSION = "v18";

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
