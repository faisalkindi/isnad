import { query } from "../db";
import { normalizeArabic } from "../normalize";

export interface HadithMatch {
  id: number;
  book_id: string;
  book_name_ar: string;
  hadith_in_book: number | null;
  grade: string | null;
  arabic_full: string;
  score: number;
}

/**
 * Find hadiths in the corpus whose Arabic text word-matches the given matn.
 * Uses pg_trgm word_similarity (good for short query in longer stored text).
 */
export async function findHadithMatches(
  matn: string,
  limit = 10,
): Promise<HadithMatch[]> {
  const normalized = normalizeArabic(matn);
  if (normalized.length < 6) return [];

  // Per-session word-similarity threshold (lower than the 0.6 default so we
  // catch wording variants; the LIMIT still keeps results tight).
  await query("SET LOCAL pg_trgm.word_similarity_threshold = 0.45");

  const res = await query<HadithMatch>(
    `SELECT id, book_id, book_name_ar, hadith_in_book, grade, arabic_full,
            word_similarity($1, arabic_normalized) AS score
     FROM hadith
     WHERE $1 <% arabic_normalized
     ORDER BY score DESC
     LIMIT $2`,
    [normalized, limit],
  );

  return res.rows.map((r) => ({ ...r, score: Number(r.score) }));
}
