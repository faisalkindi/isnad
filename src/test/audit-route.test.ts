import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/claude", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/claude")>();
  return { ...actual, callClaude: vi.fn() };
});

import { callClaude } from "@/lib/claude";
import { POST } from "@/app/api/audit/route";
import { findCandidates } from "@/lib/match/candidates";
import { inputHash } from "@/lib/match/cache";
import { query, pool } from "@/lib/db";

const mockClaude = vi.mocked(callClaude);

function post(isnad: unknown, ip: string) {
  return POST(
    new NextRequest("http://localhost/api/audit", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ isnad }),
    }),
  );
}

describe("POST /api/audit", () => {
  beforeEach(() => mockClaude.mockReset());

  it("400s when the isnād is missing", async () => {
    const res = await post(undefined, `ip-${Math.random()}`);
    expect(res.status).toBe(400);
  });

  it("422s when the text is not an isnād", async () => {
    mockClaude.mockResolvedValue("this is not a json array");
    const res = await post("just some words", `ip-${Math.random()}`);
    expect(res.status).toBe(422);
  });

  it("returns a matched chain for a valid isnād", async () => {
    const candidates = await findCandidates("الزهري");
    const input = "حدثنا الزهري";
    await query("DELETE FROM match_cache WHERE input_hash = $1", [
      inputHash(input),
    ]);
    mockClaude
      .mockResolvedValueOnce('{"narrators":["الزهري"],"matn":""}')
      .mockResolvedValueOnce(
        `[{"position":0,"chosen_id":${candidates[0].id},"confidence":"high"}]`,
      );
    const res = await post(input, `ip-${Math.random()}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.narrators).toHaveLength(1);
  });

  it("429s once the rate limit is exceeded", async () => {
    const ip = `flood-${Math.random()}`;
    for (let i = 0; i < 20; i++) await post(undefined, ip);
    const res = await post(undefined, ip);
    expect(res.status).toBe(429);
  });

  afterAll(async () => {
    await query("DELETE FROM match_cache WHERE input_hash = $1", [
      inputHash("حدثنا الزهري"),
    ]);
    await pool.end();
  });
});
