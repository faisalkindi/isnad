-- Tag the four narrators classically known as practitioners of تدليس التسوية
-- (the worst form of tadlīs — dropping a weak intermediary between two
-- reliable narrators). Source: al-ʿIrāqī's notes on Ibn al-Ṣalāḥ + al-Suyūṭī's
-- Tadrīb al-Rāwī. The four canonical practitioners:
--   * بقية بن الوليد
--   * الوليد بن مسلم
--   * الأعمش (سليمان بن مهران)
--   * سفيان الثوري

ALTER TABLE narrator
  ADD COLUMN IF NOT EXISTS practices_taswiya BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN narrator.practices_taswiya IS
  'TRUE if the narrator is among the classical practitioners of تدليس التسوية.';
