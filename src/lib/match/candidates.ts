import { query } from "../db";
import { normalizeArabic } from "../normalize";

export interface NarratorCandidate {
  id: number;
  full_name: string;
  grade_en: string | null;
  grade_ar: string | null;
  tabaqat: string | null;
  death: string | null;
  score: number;
}

interface CandidateRow extends NarratorCandidate {
  prominence: number;
}

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

  const res = await query<CandidateRow>(
    `SELECT n.id, n.full_name, n.grade_en, n.grade_ar, n.tabaqat, n.death,
            max(similarity(nv.normalized_variant, $1)) AS score,
            (SELECT count(*) FROM source_grade sg WHERE sg.narrator_id = n.id)
              AS prominence
     FROM name_variant nv
     JOIN narrator n ON n.id = nv.narrator_id
     WHERE nv.normalized_variant % $1
     GROUP BY n.id, n.full_name, n.grade_en, n.grade_ar, n.tabaqat, n.death
     ORDER BY score DESC, prominence DESC
     LIMIT $2`,
    [normalized, limit],
  );

  return res.rows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    grade_en: r.grade_en,
    grade_ar: r.grade_ar,
    tabaqat: r.tabaqat,
    death: r.death,
    score: Number(r.score),
  }));
}
