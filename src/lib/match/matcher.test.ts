import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

vi.mock("../claude", () => ({
  callClaude: vi.fn(),
}));

import { callClaude } from "../claude";
import { matchChain } from "./matcher";
import { findCandidates } from "./candidates";
import { inputHash } from "./cache";
import { query, pool } from "../db";

const mockClaude = vi.mocked(callClaude);

// Inputs unique to this file, so the shared match_cache table can't leak
// results between tests or between test files running in parallel.
// Include a Prophet reference so nisbah detection correctly identifies this
// as marfūʿ and appends the Prophet ﷺ to the chain.
const MATCH_INPUT = "أخبرنا الزهري عن النبي صلى الله عليه وسلم قال";
const HALLUCINATION_INPUT = "أنبأنا الزهري";
const NOT_FOUND_INPUT = "عن zzzqqqxxx";
const ALL_INPUTS = [MATCH_INPUT, HALLUCINATION_INPUT, NOT_FOUND_INPUT];

async function clearCache() {
  for (const input of ALL_INPUTS) {
    await query("DELETE FROM match_cache WHERE input_hash = $1", [
      inputHash(input),
    ]);
  }
}

describe("matchChain", () => {
  beforeEach(async () => {
    mockClaude.mockReset();
    await clearCache();
  });

  it("matches a narrator the disambiguator picks from the candidate list", async () => {
    const candidates = await findCandidates("الزهري");
    const realId = candidates[0].id;

    mockClaude
      .mockResolvedValueOnce('{"narrators":["الزهري"],"matn":""}') // segmentation
      .mockResolvedValueOnce(
        `[{"position":0,"chosen_id":${realId},"confidence":"high"}]`,
      ); // disambiguation

    const result = await matchChain(MATCH_INPUT);
    // 1 pasted narrator + the Prophet ﷺ appended as the source
    expect(result.narrators).toHaveLength(2);
    expect(result.narrators[0].status).toBe("matched");
    expect(result.narrators[0].narrator?.id).toBe(realId);
    expect(result.narrators[0].confidence).toBe("high");
    expect(result.narrators[1].is_source).toBe(true);
  });

  it("rejects a hallucinated id and flags the position for review", async () => {
    mockClaude
      .mockResolvedValueOnce('{"narrators":["الزهري"],"matn":""}')
      .mockResolvedValueOnce(
        '[{"position":0,"chosen_id":999999999,"confidence":"high"}]',
      );

    const result = await matchChain(HALLUCINATION_INPUT);
    expect(result.narrators[0].status).toBe("needs_review");
    expect(result.narrators[0].narrator).toBeNull();
    expect(result.narrators[0].candidates.length).toBeGreaterThan(0);
  });

  it("marks a fragment with no candidates as not_found", async () => {
    mockClaude.mockResolvedValueOnce('{"narrators":["zzzqqqxxx"],"matn":""}');
    const result = await matchChain(NOT_FOUND_INPUT);
    expect(result.narrators[0].status).toBe("not_found");
    expect(result.narrators[0].candidates).toEqual([]);
  });

  afterAll(async () => {
    await clearCache();
    await pool.end();
  });
});
