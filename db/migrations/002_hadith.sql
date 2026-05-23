-- Hadith corpus from Itqan (Sunni, 18 books, ~112K hadiths).

CREATE TABLE IF NOT EXISTS hadith (
  id                bigserial PRIMARY KEY,
  book_id           text NOT NULL,
  book_name_ar      text NOT NULL,
  book_name_en      text NOT NULL,
  hadith_in_book    integer,
  chapter_no        integer,
  chapter_name_ar   text,
  arabic_full       text NOT NULL,
  arabic_normalized text NOT NULL,    -- normalized for trigram search
  english_text      text,
  english_narrator  text,
  grade             text                -- "Sahih", "Hasan", "Da'if", etc.
);

CREATE INDEX IF NOT EXISTS idx_hadith_book ON hadith(book_id);
CREATE INDEX IF NOT EXISTS idx_hadith_arabic_trgm
  ON hadith USING gin (arabic_normalized gin_trgm_ops);
