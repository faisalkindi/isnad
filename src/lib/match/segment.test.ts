import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../claude", () => ({
  callClaude: vi.fn(),
}));

import { callClaude } from "../claude";
import { segmentIsnad, ParseError } from "./segment";

const mockClaude = vi.mocked(callClaude);

describe("segmentIsnad", () => {
  beforeEach(() => mockClaude.mockReset());

  it("returns ordered narrators and matn (legacy string array tolerated)", async () => {
    mockClaude.mockResolvedValue(
      '{"narrators":["مالك","نافع","ابن عمر"],"matn":"إنما الأعمال بالنيات"}',
    );
    const r = await segmentIsnad("...");
    // Strings get upgraded to {name, formula: null} for backwards compatibility.
    expect(r.narrators.map((n) => n.name)).toEqual([
      "مالك",
      "نافع",
      "ابن عمر",
    ]);
    expect(r.narrators.every((n) => n.formula === null)).toBe(true);
    expect(r.matn).toBe("إنما الأعمال بالنيات");
  });

  it("returns formula per narrator when provided", async () => {
    mockClaude.mockResolvedValue(
      JSON.stringify({
        narrators: [
          { name: "مالك", formula: "haddathana" },
          { name: "نافع", formula: "an" },
          { name: "ابن عمر", formula: null },
        ],
        matn: "...",
      }),
    );
    const r = await segmentIsnad("...");
    expect(r.narrators).toEqual([
      { name: "مالك", formula: "haddathana" },
      { name: "نافع", formula: "an" },
      { name: "ابن عمر", formula: null },
    ]);
  });

  it("handles an isnād-only input (empty matn)", async () => {
    mockClaude.mockResolvedValue(
      '{"narrators":["مالك","نافع","ابن عمر"],"matn":""}',
    );
    const r = await segmentIsnad("...");
    expect(r.narrators).toHaveLength(3);
    expect(r.matn).toBe("");
  });

  it("tolerates markdown-fenced JSON", async () => {
    mockClaude.mockResolvedValue(
      '```json\n{"narrators":["سفيان","الأعمش"],"matn":"حديث"}\n```',
    );
    const names = (await segmentIsnad("...")).narrators.map((n) => n.name);
    expect(names).toEqual(["سفيان", "الأعمش"]);
  });

  it("throws ParseError on non-JSON output", async () => {
    mockClaude.mockResolvedValue("I could not find an isnād.");
    await expect(segmentIsnad("...")).rejects.toThrow(ParseError);
  });

  it("throws ParseError when narrators is missing or non-array", async () => {
    mockClaude.mockResolvedValue('{"matn":"text only"}');
    await expect(segmentIsnad("...")).rejects.toThrow(ParseError);
  });
});
