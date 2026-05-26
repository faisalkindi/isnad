-- Phase 3: Per-edge verb strength from al-Tārīkh al-Kabīr (and other primary
-- sources that record explicit sama'/liqa/idrak/riwaya patterns).
--
-- Verb-strength ladder (descending):
--   samaa  = «سمع من X»            (Bukhārī-grade — explicit hearing)
--   liqa   = «لقي X»              (met, didn't explicitly hear)
--   idraka = «أدرك X»             (lifetime overlap only)
--   rawa   = «روى عن X»            (narrated from — could be wāsiṭa)
--   kataba = «كتب إليه X»          (correspondence only — no in-person)
--
-- A single (student, teacher) pair can have multiple rows (different verbs
-- from different sources). The matcher picks the strongest one available.

CREATE TABLE IF NOT EXISTS attestation_verb (
  id              bigserial PRIMARY KEY,
  student_id      integer NOT NULL REFERENCES narrator(id),
  teacher_id      integer NOT NULL REFERENCES narrator(id),
  verb            text NOT NULL CHECK (verb IN ('samaa','liqa','idraka','rawa','kataba')),
  source_book     text NOT NULL,
  phrase_ar       text,
  UNIQUE (student_id, teacher_id, verb, source_book)
);

CREATE INDEX IF NOT EXISTS attestation_verb_pair_idx
  ON attestation_verb (student_id, teacher_id);
