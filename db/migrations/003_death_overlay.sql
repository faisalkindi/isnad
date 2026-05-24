-- Death-year overlay from AR-Sanad 280K (somaia02/Narrator-Disambiguation).
-- Itqan's `death` field is missing for ~68% of narrators; AR-Sanad has explicit
-- death years for ~9.4k narrators. We store the AR-Sanad value in a separate
-- column so the original Itqan data stays untouched and auditable. Queries that
-- need a usable death year read COALESCE(death, death_overlay).

ALTER TABLE narrator
  ADD COLUMN IF NOT EXISTS death_overlay TEXT;

COMMENT ON COLUMN narrator.death_overlay IS
  'Death year from AR-Sanad 280K, written only when Itqan death is null/empty.';
