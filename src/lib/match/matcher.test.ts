import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

vi.mock("../claude", () => ({
  callClaude: vi.fn(),
}));

import { callClaude } from "../claude";
import { matchChain } from "./matcher";
import { findCandidates } from "./candidates";
import { pool } from "../db";

const mockClaude = vi.mocked(callClaude);

describe("matchChain", () => {
  beforeEach(() => mockClaude.mockReset());

  it("matches a narrator the disambiguator picks from the candidate list", async () => {
    const candidates = await findCandidates("الزهري");
    const realId = candidates[0].id;

    mockClaude
      .mockResolvedValueOnce('["الزهري"]') // segmentation
      .mockResolvedValueOnce(
        `[{"position":0,"chosen_id":${realId},"confidence":"high"}]`,
      ); // disambiguation

    const result = await matchChain("عن الزهري");
    expect(result.narrators).toHaveLength(1);
    expect(result.narrators[0].status).toBe("matched");
    expect(result.narrators[0].narrator?.id).toBe(realId);
    expect(result.narrators[0].confidence).toBe("high");
  });

  it("rejects a hallucinated id and flags the position for review", async () => {
    mockClaude
      .mockResolvedValueOnce('["الزهري"]')
      .mockResolvedValueOnce(
        '[{"position":0,"chosen_id":999999999,"confidence":"high"}]',
      );

    const result = await matchChain("عن الزهري");
    expect(result.narrators[0].status).toBe("needs_review");
    expect(result.narrators[0].narrator).toBeNull();
    // candidates are still returned so the user can correct it
    expect(result.narrators[0].candidates.length).toBeGreaterThan(0);
  });

  it("marks a fragment with no candidates as not_found", async () => {
    mockClaude.mockResolvedValueOnce('["zzzqqqxxx"]');
    const result = await matchChain("عن zzzqqqxxx");
    expect(result.narrators[0].status).toBe("not_found");
    expect(result.narrators[0].candidates).toEqual([]);
  });

  afterAll(async () => {
    await pool.end();
  });
});
