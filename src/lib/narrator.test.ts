import { describe, it, expect, afterAll } from "vitest";
import { getNarrator } from "./narrator";
import { pool } from "./db";

describe("getNarrator", () => {
  it("returns full detail for a known narrator", async () => {
    const n = await getNarrator(320);
    expect(n).not.toBeNull();
    expect(n!.full_name).toBe("سعيد بن سماك بن حرب");
    expect(n!.nameVariants).toHaveLength(5);
    expect(n!.sourceGrades.map((s) => s.source_book)).toContain("mizan");
    expect(n!.teacherIds).toContain(2325);
    expect(n!.studentIds).toContain(319);
  });

  it("returns null for a nonexistent narrator", async () => {
    expect(await getNarrator(999_999_999)).toBeNull();
  });

  afterAll(async () => {
    await pool.end();
  });
});
