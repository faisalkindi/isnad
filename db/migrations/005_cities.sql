-- Cities overlay from AR-Sanad 280K. Itqan's `city` column covers only ~3.9% of
-- narrators. AR-Sanad's living_city / journey_city / death_city add another
-- layer (still sparse, but useful as a "plausibility" signal for whether
-- a teacher-student link is geographically plausible).
--
-- We store as a TEXT (comma-separated cities). Honest framing: city overlap is
-- a WEAK signal — it doesn't prove meeting, only that meeting was geographically
-- possible. Many narrators travelled (riḥla, Hajj) so non-overlap is also weak.

ALTER TABLE narrator
  ADD COLUMN IF NOT EXISTS cities_overlay TEXT;

COMMENT ON COLUMN narrator.cities_overlay IS
  'Comma-separated cities from AR-Sanad (living/journey/death). Weak plausibility signal only.';
