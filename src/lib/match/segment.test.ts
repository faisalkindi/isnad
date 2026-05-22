import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../claude", () => ({
  callClaude: vi.fn(),
}));

import { callClaude } from "../claude";
import { segmentIsnad, ParseError } from "./segment";

const mockClaude = vi.mocked(callClaude);

describe("segmentIsnad", () => {
  beforeEach(() => mockClaude.mockReset());

  it("returns the ordered narrator names", async () => {
    mockClaude.mockResolvedValue('["مالك","نافع","ابن عمر"]');
    const result = await segmentIsnad("حدثنا مالك عن نافع عن ابن عمر");
    expect(result).toEqual(["مالك", "نافع", "ابن عمر"]);
  });

  it("tolerates a markdown-fenced JSON array", async () => {
    mockClaude.mockResolvedValue('```json\n["سفيان","الأعمش"]\n```');
    expect(await segmentIsnad("...")).toEqual(["سفيان", "الأعمش"]);
  });

  it("trims whitespace and drops empty entries", async () => {
    mockClaude.mockResolvedValue('["  مالك  ", "", "نافع"]');
    expect(await segmentIsnad("...")).toEqual(["مالك", "نافع"]);
  });

  it("throws ParseError on non-JSON output", async () => {
    mockClaude.mockResolvedValue("I could not find an isnad here.");
    await expect(segmentIsnad("...")).rejects.toThrow(ParseError);
  });

  it("throws ParseError when the array is not all strings", async () => {
    mockClaude.mockResolvedValue('["مالك", 42]');
    await expect(segmentIsnad("...")).rejects.toThrow(ParseError);
  });
});
