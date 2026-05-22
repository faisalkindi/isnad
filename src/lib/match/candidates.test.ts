import { describe, it, expect, afterAll } from "vitest";
import { findCandidates } from "./candidates";
import { pool } from "../db";

describe("findCandidates", () => {
  it("finds candidates for a well-known narrator name", async () => {
    const results = await findCandidates("الزهري");
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.score).toBeLessThanOrEqual(1);
      expect(typeof r.full_name).toBe("string");
    }
  });

  it("matches despite missing diacritics (normalization)", async () => {
    const withTashkeel = await findCandidates("الزُّهْريّ");
    expect(withTashkeel.length).toBeGreaterThan(0);
  });

  it("respects the limit", async () => {
    const results = await findCandidates("محمد", 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it("returns an empty array for gibberish", async () => {
    const results = await findCandidates("zzzqqqxxx");
    expect(results).toEqual([]);
  });

  afterAll(async () => {
    await pool.end();
  });
});
