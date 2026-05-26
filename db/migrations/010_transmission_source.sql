-- Phase 1: Cite the source book(s) that attest each teacher-student edge.
--
-- Itqan's raw profile data only gives flat `teachers[]` / `students[]` arrays
-- without per-edge source attribution. The best approximation we can compute
-- is: for each (student, teacher) pair, the set of classical books that
-- mention BOTH narrators (intersection of their `classical_sources` keys).
-- The named book is then a candidate attestation source.
--
-- This is weaker than knowing which book actually recorded the edge, but it's
-- honest: if both narrators appear in Tahdhīb al-Kamāl, then their teacher-
-- student relationship is likely documented there. The UI surfaces this with
-- the same caveat phrasing.

ALTER TABLE transmission
  ADD COLUMN IF NOT EXISTS source_books text[] DEFAULT '{}';

-- GIN index for "any of these books" lookups.
CREATE INDEX IF NOT EXISTS transmission_source_books_idx
  ON transmission USING GIN (source_books);
