import { describe, it, expect } from "vitest";
import { checkRate } from "./ratelimit";

describe("checkRate", () => {
  it("allows requests up to the limit, then blocks", () => {
    const ip = `ip-${Math.random()}`;
    for (let i = 0; i < 20; i++) {
      expect(checkRate(ip)).toBe(true);
    }
    expect(checkRate(ip)).toBe(false);
  });

  it("tracks IPs independently", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    for (let i = 0; i < 20; i++) checkRate(a);
    expect(checkRate(a)).toBe(false);
    expect(checkRate(b)).toBe(true);
  });
});
