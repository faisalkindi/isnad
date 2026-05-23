import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

vi.mock("../claude", () => ({
  callClaude: vi.fn(),
}));

import { callClaude } from "../claude";
import { matchChain } from "./matcher";
import { inputHash } from "./cache";
import { findCandidates } from "./candidates";
import { query, pool } from "../db";

const mockClaude = vi.mocked(callClaude);
const INPUT = "عن الزهري";

describe("match cache", () => {
  beforeEach(async () => {
    mockClaude.mockReset();
    await query("DELETE FROM match_cache WHERE input_hash = $1", [
      inputHash(INPUT),
    ]);
  });

  it("serves an identical second request from cache, with no new Claude calls", async () => {
    const candidates = await findCandidates("الزهري");
    mockClaude
      .mockResolvedValueOnce('{"narrators":["الزهري"],"matn":""}')
      .mockResolvedValueOnce(
        `[{"position":0,"chosen_id":${candidates[0].id},"confidence":"high"}]`,
      );

    const first = await matchChain(INPUT);
    expect(mockClaude.mock.calls.length).toBe(2); // segmentation + disambiguation

    const second = await matchChain(INPUT);
    expect(mockClaude.mock.calls.length).toBe(2); // unchanged — served from cache
    expect(second).toEqual(first);
  });

  afterAll(async () => {
    await query("DELETE FROM match_cache WHERE input_hash = $1", [
      inputHash(INPUT),
    ]);
    await pool.end();
  });
});
