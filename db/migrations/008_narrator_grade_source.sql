-- Per-source narrator grades (rijāl scholar verdicts).
--
-- Our `narrator` table only carries a single `grade_ar` field — that flattens
-- away the source. Different scholars (al-Dāraquṭnī, Ibn Ḥajar, al-ʿIjlī…)
-- can have meaningfully different verdicts on the same narrator, and modern
-- audits need to surface them side by side so the user can weigh them.
--
-- This table is the per-source layer:
--   narrator_id    → which narrator
--   source_book    → identifier of the rijāl work the verdict was extracted
--                    from (e.g., "daraqutni_mawsuah" for موسوعة أقوال
--                    أبي الحسن الدارقطني في رجال الحديث وعلله)
--   author_ar      → display label for the SCHOLAR whose verdict this is
--                    (e.g., "الدارقطني"). Distinct from `source_book` because
--                    a single book like the موسوعة aggregates one scholar's
--                    verdicts from many primary sources.
--   verdict_ar     → Daraqutni's verdict text, verbatim (no interpretation)
--   relayed_via    → who relayed this verdict (e.g., "الحاكم", "البرقاني")
--   page_ref       → page reference in the source as printed
--   raw_entry      → the full original entry text, for audit / re-parse
--
-- (narrator_id, source_book, verdict_ar) is unique so we never double-insert
-- the same verdict on a re-import.

CREATE TABLE IF NOT EXISTS narrator_grade_source (
  id            BIGSERIAL PRIMARY KEY,
  narrator_id   INTEGER NOT NULL REFERENCES narrator(id) ON DELETE CASCADE,
  source_book   TEXT    NOT NULL,
  author_ar     TEXT    NOT NULL,
  verdict_ar    TEXT    NOT NULL,
  relayed_via   TEXT,
  page_ref      TEXT,
  raw_entry     TEXT,
  match_score   REAL,
  imported_at   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ngs_narrator    ON narrator_grade_source(narrator_id);
CREATE INDEX IF NOT EXISTS idx_ngs_source_book ON narrator_grade_source(source_book);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ngs_narrator_source_verdict
  ON narrator_grade_source(narrator_id, source_book, md5(verdict_ar));

-- Track imports so we can resume / report progress without re-scraping.
CREATE TABLE IF NOT EXISTS source_import_log (
  source_book   TEXT PRIMARY KEY,
  total_entries INTEGER NOT NULL DEFAULT 0,
  matched       INTEGER NOT NULL DEFAULT 0,
  unmatched     INTEGER NOT NULL DEFAULT 0,
  last_run_at   TIMESTAMP NOT NULL DEFAULT now()
);
