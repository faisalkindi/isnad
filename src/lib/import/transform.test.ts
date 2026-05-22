import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transformProfile } from "./transform";

const profile320 = JSON.parse(
  readFileSync(join("src", "test", "fixtures", "profile-320.json"), "utf8"),
);

describe("transformProfile", () => {
  it("maps narrator core fields, keeping missing data verbatim", () => {
    const out = transformProfile(profile320);
    expect(out.narrator.id).toBe(320);
    expect(out.narrator.full_name).toBe("سعيد بن سماك بن حرب");
    expect(out.narrator.grade_en).toBe("abandoned");
    expect(out.narrator.itqan_confidence).toBe("B");
    expect(out.narrator.death).toBe("-"); // Itqan's "not recorded" marker, kept as-is
  });

  it("extracts every name variant from namings", () => {
    const out = transformProfile(profile320);
    expect(out.nameVariants).toHaveLength(5);
    expect(out.nameVariants.every((v) => v.narrator_id === 320)).toBe(true);
    expect(out.nameVariants.map((v) => v.variant)).toContain(
      "سعيد بن سماك الذهلي",
    );
  });

  it("extracts per-book source grades", () => {
    const out = transformProfile(profile320);
    expect(out.sourceGrades).toHaveLength(6);
    const mizan = out.sourceGrades.find((s) => s.source_book === "mizan");
    expect(mizan?.entry_id).toBe(3208);
    expect(mizan?.grade_ar).toBe("متروك الحديث");
  });

  it("builds transmission edges from teachers and students", () => {
    const out = transformProfile(profile320);
    // teachers [2325, 7019]: narrator 320 is the student
    expect(out.transmissions).toContainEqual({ student_id: 320, teacher_id: 2325 });
    expect(out.transmissions).toContainEqual({ student_id: 320, teacher_id: 7019 });
    // students [319, 1142, 2790]: narrator 320 is the teacher
    expect(out.transmissions).toContainEqual({ student_id: 319, teacher_id: 320 });
    expect(out.transmissions).toHaveLength(5);
  });
});
