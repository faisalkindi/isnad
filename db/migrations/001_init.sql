-- Isnād Reference & Visualizer — initial schema (v1)
-- Mirrors Itqan's verified profile schema (see design doc §5, §15).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- One row per canonical narrator.
CREATE TABLE IF NOT EXISTS narrator (
  id               integer PRIMARY KEY,
  full_name        text NOT NULL,
  kunya            text,
  laqab            text,
  nasab            text,
  grade_en         text,
  grade_ar         text,
  death            text,          -- Itqan stores '-' when unknown; kept verbatim
  tabaqat          text,
  city             text,
  itqan_confidence text,
  id_score         integer,
  grade_score      integer
);

-- Every name form a narrator appears under. This is the matcher's lookup index.
CREATE TABLE IF NOT EXISTS name_variant (
  id                 bigserial PRIMARY KEY,
  narrator_id        integer NOT NULL REFERENCES narrator(id),
  variant            text NOT NULL,
  normalized_variant text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_name_variant_norm_trgm
  ON name_variant USING gin (normalized_variant gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_name_variant_narrator
  ON name_variant (narrator_id);

-- How each classical text graded a narrator (per-book, not per-critic).
CREATE TABLE IF NOT EXISTS source_grade (
  id          bigserial PRIMARY KEY,
  narrator_id integer NOT NULL REFERENCES narrator(id),
  source_book text NOT NULL,
  entry_id    integer,
  grade_en    text,
  grade_ar    text
);
CREATE INDEX IF NOT EXISTS idx_source_grade_narrator
  ON source_grade (narrator_id);

-- Documented teacher -> student links (from Itqan's teachers/students arrays).
CREATE TABLE IF NOT EXISTS transmission (
  student_id integer NOT NULL REFERENCES narrator(id),
  teacher_id integer NOT NULL REFERENCES narrator(id),
  PRIMARY KEY (student_id, teacher_id)
);

-- Caches a full match result keyed by the normalized-input hash.
CREATE TABLE IF NOT EXISTS match_cache (
  input_hash text PRIMARY KEY,
  result     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Tracks Claude API calls per month for the spend cap.
CREATE TABLE IF NOT EXISTS usage_counter (
  month        text PRIMARY KEY,   -- 'YYYY-MM'
  claude_calls integer NOT NULL DEFAULT 0
);
