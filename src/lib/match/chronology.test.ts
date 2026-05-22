import { describe, it, expect } from "vitest";
import { parseDeathYears, checkLink } from "./chronology";

describe("parseDeathYears", () => {
  it("returns empty for null, blank, or '-'", () => {
    expect(parseDeathYears(null)).toEqual([]);
    expect(parseDeathYears("")).toEqual([]);
    expect(parseDeathYears("-")).toEqual([]);
  });
  it("parses a single Hijri year", () => {
    expect(parseDeathYears("99هـ")).toEqual([99]);
    expect(parseDeathYears("178 هـ")).toEqual([178]);
  });
  it("parses multiple alternative years", () => {
    expect(parseDeathYears("178 هـ ، أو 179 هـ")).toEqual([178, 179]);
    expect(
      parseDeathYears("116هـ ، أو 117هـ ، أو 118هـ ، أو 119هـ ، أو 120هـ"),
    ).toEqual([116, 117, 118, 119, 120]);
  });
});

describe("checkLink — chronological possibility", () => {
  it("accepts a plausible teacher-student gap (Mālik <- Nāfiʿ)", () => {
    const r = checkLink({ death: "179 هـ" }, { death: "117 هـ" });
    expect(r.status).toBe("possible");
  });

  it("flags impossible when the student died much later than the teacher (>93 years)", () => {
    const r = checkLink({ death: "300 هـ" }, { death: "100 هـ" });
    expect(r.status).toBe("impossible");
  });

  it("flags impossible when the teacher was born after the student died (>100 years later)", () => {
    const r = checkLink({ death: "100 هـ" }, { death: "300 هـ" });
    expect(r.status).toBe("impossible");
  });

  it("uses the most favorable alternatives — flags impossible only when even the best case fails", () => {
    // Student died 200; teacher died 100 or 105. Most favorable: T=105 -> diff 95 > 93 -> impossible.
    expect(
      checkLink({ death: "200 هـ" }, { death: "100 هـ ، أو 105 هـ" }).status,
    ).toBe("impossible");

    // Same student; teacher died 100 or 115. Most favorable: T=115 -> diff 85 -> possible.
    expect(
      checkLink({ death: "200 هـ" }, { death: "100 هـ ، أو 115 هـ" }).status,
    ).toBe("possible");
  });

  it("returns unknown when either death year is missing", () => {
    expect(checkLink({ death: null }, { death: "100 هـ" }).status).toBe("unknown");
    expect(checkLink({ death: "100 هـ" }, { death: "-" }).status).toBe("unknown");
  });
});
