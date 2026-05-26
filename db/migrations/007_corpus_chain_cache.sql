-- Per-corpus-hadith parsed-chain cache.
--
-- Counting tawātur the classical way requires knowing the narrators of EVERY
-- corpus chain carrying a given matn, then aligning them by طبقة and counting
-- distinct narrators at each level. We segment each corpus chain through the
-- LLM (same segmenter we use for user input), then cache the result here
-- keyed on the hadith row id. Subsequent audits hit the cache instead of
-- re-paying the LLM cost.
--
-- `narrators_normalized` holds names already passed through normalizeArabic(),
-- in chain order (compiler-first, source-last) — that matches how the
-- segmenter returns them. The alignment step in chain-align.ts reverses
-- per-chain so position 0 is the source (Companion) when counting per-level
-- multiplicity.

CREATE TABLE IF NOT EXISTS corpus_chain_cache (
  hadith_id            INTEGER PRIMARY KEY REFERENCES hadith(id) ON DELETE CASCADE,
  narrators_normalized TEXT[] NOT NULL,
  segmented_at         TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_corpus_chain_cache_segmented_at
  ON corpus_chain_cache (segmented_at);
