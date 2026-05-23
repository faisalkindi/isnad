import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../claude", () => ({
  callClaude: vi.fn(),
}));

import { callClaude } from "../claude";
import { segmentIsnad, ParseError } from "./segment";

const mockClaude = vi.mocked(callClaude);

describe("segmentIsnad", () => {
  beforeEach(() => mockClaude.mockReset());

  it("returns ordered narrators and matn", async () => {
    mockClaude.mockResolvedValue(
      '{"narrators":["مالك","نافع","ابن عمر"],"matn":"إنما الأعمال بالنيات"}',
    );
    const r = await segmentIsnad("...");
    expect(r.narrators).toEqual(["مالك", "نافع", "ابن عمر"]);
    expect(r.matn).toBe("إنما الأعمال بالنيات");
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
    expect((await segmentIsnad("...")).narrators).toEqual(["سفيان", "الأعمش"]);
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
