import { describe, it, expect, afterAll } from "vitest";
import { findHadithMatches } from "./corpus";
import { pool } from "../db";

describe("findHadithMatches", () => {
  it(
    "finds the famous 'actions are by intentions' hadith from Bukhari",
    async () => {
      const matn = "إنما الأعمال بالنيات وإنما لكل امرئ ما نوى";
      const results = await findHadithMatches(matn);
      expect(results.length).toBeGreaterThan(0);
      // top result should be from a canonical collection
      expect(results[0].book_id).toBeTruthy();
      // top score should be reasonably high — the matn is the actual text
      expect(results[0].score).toBeGreaterThan(0.6);
    },
    // The trgm threshold is set inside an explicit transaction now; the
    // round-trip + cold trgm index page-in needs more than the 5s default.
    30_000,
  );

  it("returns empty for too-short / gibberish input", async () => {
    expect(await findHadithMatches("")).toEqual([]);
    expect(await findHadithMatches("ا")).toEqual([]);
  });

  afterAll(async () => {
    await pool.end();
  });
});
