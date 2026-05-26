import { pool } from "../db";
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
 *
 * Uses the pg_trgm `<%` (word_similarity) operator so it can ride the GIN
 * trigram index on `arabic_normalized`. `<%` consults the GUC
 * `pg_trgm.word_similarity_threshold` (default 0.6); we lower it to 0.45 so
 * we catch wording variants (e.g. "إنما الأعمال بالنية" vs "بالنيات").
 *
 * The threshold MUST be set with `SET LOCAL` inside an explicit transaction
 * — otherwise the implicit per-statement transaction commits the setting
 * away before the SELECT runs, falling back to 0.6 and returning 0 rows
 * for short-matn searches. We pin both statements to the same pooled
 * client so SET LOCAL stays in scope for the SELECT.
 */
export async function findHadithMatches(
  matn: string,
  limit = 10,
): Promise<HadithMatch[]> {
  const normalized = normalizeArabic(matn);
  if (normalized.length < 6) return [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL pg_trgm.word_similarity_threshold = 0.45");
    const res = await client.query<HadithMatch>(
      `SELECT id, book_id, book_name_ar, hadith_in_book, grade, arabic_full,
              word_similarity($1, arabic_normalized) AS score
       FROM hadith
       WHERE $1 <% arabic_normalized
       ORDER BY score DESC
       LIMIT $2`,
      [normalized, limit],
    );
    await client.query("COMMIT");
    return res.rows.map((r) => ({ ...r, score: Number(r.score) }));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
