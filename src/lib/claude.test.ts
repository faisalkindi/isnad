import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// Mock the Anthropic SDK so tests are deterministic, free, and offline.
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async () => ({
        content: [{ type: "text", text: "MOCK RESPONSE" }],
      }),
    };
  },
}));

import { callClaude, withinBudget, BudgetExceededError } from "./claude";
import { query, pool } from "./db";

const MONTH = new Date().toISOString().slice(0, 7);

describe("Claude client + spend cap", () => {
  beforeEach(async () => {
    await query("DELETE FROM usage_counter WHERE month = $1", [MONTH]);
  });

  it("is within budget when under the cap", async () => {
    process.env.CLAUDE_MONTHLY_CAP = "100";
    expect(await withinBudget()).toBe(true);
  });

  it("returns text and increments the counter on a successful call", async () => {
    process.env.CLAUDE_MONTHLY_CAP = "100";
    const text = await callClaude("hello");
    expect(text).toBe("MOCK RESPONSE");

    const res = await query<{ claude_calls: number }>(
      "SELECT claude_calls FROM usage_counter WHERE month = $1",
      [MONTH],
    );
    expect(res.rows[0].claude_calls).toBe(1);
  });

  it("blocks the call once the cap is reached", async () => {
    process.env.CLAUDE_MONTHLY_CAP = "1";
    await query(
      `INSERT INTO usage_counter (month, claude_calls) VALUES ($1, 1)
       ON CONFLICT (month) DO UPDATE SET claude_calls = 1`,
      [MONTH],
    );
    await expect(callClaude("hello")).rejects.toThrow(BudgetExceededError);
  });

  afterAll(async () => {
    await query("DELETE FROM usage_counter WHERE month = $1", [MONTH]);
    await pool.end();
  });
});
