import { describe, it, expect, afterAll } from "vitest";
import { query, pool } from "./db";

describe("database connection", () => {
  it("connects to Neon and runs SELECT 1", async () => {
    const result = await query<{ one: number }>("SELECT 1 AS one");
    expect(result.rows[0].one).toBe(1);
  });

  afterAll(async () => {
    await pool.end();
  });
});
