-- Mudallisīn classification per Ibn Ḥajar's «Ṭabaqāt al-Mudallisīn»
-- (تعريف أهل التقديس بمراتب الموصوفين بالتدليس).
-- Tier 1 = rare tadlīs (acceptable); Tier 5 = rejected even with explicit
-- hearing because of other weaknesses. The classical principle is that
-- chains using "عن" (ʿan) from a tier-3+ mudallis are considered weak unless
-- the narrator explicitly stated he heard (تصريحاً بالسماع: حدثنا / سمعت).

ALTER TABLE narrator
  ADD COLUMN IF NOT EXISTS tadlis_tier SMALLINT
    CHECK (tadlis_tier IS NULL OR tadlis_tier BETWEEN 1 AND 5);

COMMENT ON COLUMN narrator.tadlis_tier IS
  'Ibn Ḥajar''s Mudallisīn tier (1–5). NULL means the narrator is not on the list.';
