import { describe, it, expect } from "vitest";
import { normalizeArabic } from "./normalize";

describe("normalizeArabic", () => {
  it("folds hamza-alif forms to bare alif", () => {
    expect(normalizeArabic("أحمد")).toBe(normalizeArabic("احمد"));
    expect(normalizeArabic("إبراهيم")).toBe(normalizeArabic("ابراهيم"));
    expect(normalizeArabic("آدم")).toBe(normalizeArabic("ادم"));
  });

  it("strips tashkeel (diacritics)", () => {
    expect(normalizeArabic("الزُّهْرِيّ")).toBe(normalizeArabic("الزهري"));
  });

  it("folds alif maqsura to ya", () => {
    expect(normalizeArabic("عيسى")).toBe(normalizeArabic("عيسي"));
  });

  it("folds ta marbuta to ha", () => {
    expect(normalizeArabic("حمزة")).toBe(normalizeArabic("حمزه"));
  });

  it("strips tatweel and collapses whitespace", () => {
    expect(normalizeArabic("محـــمد")).toBe("محمد");
    expect(normalizeArabic("  ابن   عمر  ")).toBe("ابن عمر");
  });

  it("is idempotent", () => {
    const once = normalizeArabic("أبو هُرَيْرَة");
    expect(normalizeArabic(once)).toBe(once);
  });
});
