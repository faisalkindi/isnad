-- Phase 2: Explicit non-meetings documented in classical rijāl literature.
--
-- Ibn Abī Ḥātim's «المراسيل» is the canonical source: he records ~1,000
-- explicit cases where one narrator did NOT hear from another (despite
-- chronological possibility). Other sources to add later: العلائي's جامع
-- التحصيل, ابن حجر's تهذيب التهذيب's إرسال notes.
--
-- A documented non-meeting OVERRIDES the chronology and any Itqan teachers/
-- students claim. It downgrades the chain to broken.

CREATE TABLE IF NOT EXISTS documented_non_meeting (
  id                 bigserial PRIMARY KEY,
  student_id         integer NOT NULL REFERENCES narrator(id),
  teacher_id         integer NOT NULL REFERENCES narrator(id),
  source_book        text NOT NULL,
  phrase_ar          text NOT NULL,
  page_ref           text,
  UNIQUE (student_id, teacher_id, source_book)
);

CREATE INDEX IF NOT EXISTS documented_non_meeting_pair_idx
  ON documented_non_meeting (student_id, teacher_id);
