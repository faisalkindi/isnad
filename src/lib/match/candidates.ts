import { query } from "../db";
import { normalizeArabic } from "../normalize";

export interface NarratorCandidate {
  id: number;
  full_name: string;
  grade_en: string | null;
  grade_ar: string | null;
  tabaqat: string | null;
  score: number;
}

/**
 * Find narrator candidates for a (possibly partial) name, using trigram
 * similarity over the normalized name-variant index. Results are ranked
 * by best-matching variant, highest score first.
 */
export async function findCandidates(
  nameQuery: string,
  limit = 8,
): Promise<NarratorCandidate[]> {
  const normalized = normalizeArabic(nameQuery);
  if (normalized.length === 0) return [];

  const res = await query<NarratorCandidate>(
    `SELECT n.id, n.full_name, n.grade_en, n.grade_ar, n.tabaqat,
            max(similarity(nv.normalized_variant, $1)) AS score
     FROM name_variant nv
     JOIN narrator n ON n.id = nv.narrator_id
     WHERE nv.normalized_variant % $1
     GROUP BY n.id, n.full_name, n.grade_en, n.grade_ar, n.tabaqat
     ORDER BY score DESC
     LIMIT $2`,
    [normalized, limit],
  );

  return res.rows.map((r) => ({ ...r, score: Number(r.score) }));
}
