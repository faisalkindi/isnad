import { query } from "../db";
import { normalizeArabic } from "../normalize";

export interface NarratorCandidate {
  id: number;
  full_name: string;
  /** Itqan's consensus grade. */
  grade_en: string | null;
  grade_ar: string | null;
  /** The HARSHEST single grading found across all 22 books for this narrator
   *  (excluding citation-only entries and "unknown"). Used as the effective
   *  grade per the app's conservative "always apply the harshest jarh" rule —
   *  classical: «الجرح المفسَّر مقدَّم على التعديل». */
  harshest_grade_en: string | null;
  /** The Arabic phrase that yielded `harshest_grade_en`, with its book key,
   *  so the UI can show "the harshest critic said «X» in book Y". */
  harshest_grade_ar: string | null;
  harshest_source_book: string | null;
  tabaqat: string | null;
  death: string | null;
  /** Ibn Hajar's Mudallisīn tier (1–5), or null if not on the list. */
  tadlis_tier: number | null;
  /** Combined Itqan city + AR-Sanad cities overlay, comma-separated. */
  cities: string | null;
  score: number;
}

interface CandidateRow extends NarratorCandidate {
  prominence: number;
}

// Tier order used for "harshest" picking — lower number = harsher.
// Excluded:
//   - citation-only grade_ar (e.g. «ذكره ابن حجر في الإصابة»)
//   - jarh-tier rows for Companions (parser noise — Companions are عدول
//     by classical consensus, so weak grades for them are almost certainly
//     misclassified contextual mentions in al-Iṣāba / al-Siyar / etc.)
const HARSHEST_SUBQUERY = `(
  SELECT row_to_json(sg) FROM (
    SELECT grade_en, grade_ar, source_book FROM source_grade
    WHERE narrator_id = n.id
      AND grade_en IS NOT NULL
      AND grade_en <> 'unknown'
      AND (grade_ar IS NULL OR grade_ar !~ '^(ذكره|ذُكر|ذكر) ')
      AND NOT (
        grade_en IN ('weak','abandoned','fabricator')
        AND EXISTS (
          SELECT 1 FROM source_grade sg2
          WHERE sg2.narrator_id = n.id
            AND (
              sg2.grade_en = 'companion'
              OR sg2.grade_ar ~ '(صحاب|صحبة|له صحبة|أدرك النبي)'
            )
        )
      )
    ORDER BY
      CASE grade_en
        WHEN 'fabricator'      THEN 0
        WHEN 'abandoned'       THEN 1
        WHEN 'weak'            THEN 2
        WHEN 'mostly_reliable' THEN 4
        WHEN 'reliable'        THEN 5
        WHEN 'companion'       THEN 6
        ELSE 3
      END ASC,
      length(grade_ar) DESC
    LIMIT 1
  ) sg
)`;

/**
 * Find narrator candidates for a (possibly partial) name, using trigram
 * similarity over the normalized name-variant index.
 *
 * Ranked by trigram similarity; ties at the top score (common for short
 * names) are broken by "prominence" — how many of the 22 classical texts
 * cover the narrator — so a well-documented narrator surfaces ahead of an
 * obscure namesake. The LLM disambiguator then picks using the chain context.
 * Recall on very common bare first-names is imperfect; see the matching-
 * accuracy risk in the design doc (the correction UI is the user's fallback).
 */
export async function findCandidates(
  nameQuery: string,
  limit = 12,
): Promise<NarratorCandidate[]> {
  const normalized = normalizeArabic(nameQuery);
  if (normalized.length === 0) return [];

  // COALESCE pulls in the AR-Sanad death_overlay when Itqan's `death` is null —
  // see migration 003 and scripts/import-arsanad-deaths.ts.
  const res = await query<
    CandidateRow & {
      cities: string | null;
      harshest: { grade_en: string; grade_ar: string; source_book: string } | null;
    }
  >(
    `SELECT n.id, n.full_name, n.grade_en, n.grade_ar, n.tabaqat,
            COALESCE(NULLIF(n.death, '-'), n.death_overlay) AS death,
            n.tadlis_tier,
            NULLIF(
              trim(both '، ' FROM
                COALESCE(NULLIF(n.city, '-'), '') || '، ' ||
                COALESCE(n.cities_overlay, '')
              ),
              ''
            ) AS cities,
            ${HARSHEST_SUBQUERY} AS harshest,
            max(similarity(nv.normalized_variant, $1)) AS score,
            (SELECT count(*) FROM source_grade sg WHERE sg.narrator_id = n.id)
              AS prominence
     FROM name_variant nv
     JOIN narrator n ON n.id = nv.narrator_id
     WHERE nv.normalized_variant % $1
     GROUP BY n.id, n.full_name, n.grade_en, n.grade_ar, n.tabaqat, n.death, n.death_overlay, n.tadlis_tier, n.city, n.cities_overlay
     ORDER BY score DESC, prominence DESC
     LIMIT $2`,
    [normalized, limit],
  );

  return res.rows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    grade_en: r.grade_en,
    grade_ar: r.grade_ar,
    harshest_grade_en: r.harshest?.grade_en ?? null,
    harshest_grade_ar: r.harshest?.grade_ar ?? null,
    harshest_source_book: r.harshest?.source_book ?? null,
    tabaqat: r.tabaqat,
    death: r.death,
    tadlis_tier: r.tadlis_tier,
    cities: r.cities,
    score: Number(r.score),
  }));
}
