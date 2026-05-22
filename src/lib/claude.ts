import Anthropic from "@anthropic-ai/sdk";
import { query } from "./db";

const MODEL = "claude-sonnet-4-6";

/** Thrown when the monthly Claude API call cap has been reached. */
export class BudgetExceededError extends Error {
  constructor() {
    super("Monthly Claude API call cap reached");
    this.name = "BudgetExceededError";
  }
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

function monthlyCap(): number {
  return Number(process.env.CLAUDE_MONTHLY_CAP ?? "5000");
}

/** True if this month's Claude call count is still under the cap. */
export async function withinBudget(): Promise<boolean> {
  const res = await query<{ claude_calls: number }>(
    "SELECT claude_calls FROM usage_counter WHERE month = $1",
    [currentMonth()],
  );
  return (res.rows[0]?.claude_calls ?? 0) < monthlyCap();
}

async function incrementUsage(): Promise<void> {
  await query(
    `INSERT INTO usage_counter (month, claude_calls) VALUES ($1, 1)
     ON CONFLICT (month) DO UPDATE
       SET claude_calls = usage_counter.claude_calls + 1`,
    [currentMonth()],
  );
}

let client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Send one user message to Claude and return its text reply.
 * Enforces the monthly spend cap; increments the counter on success.
 */
export async function callClaude(
  userMessage: string,
  options: { maxTokens?: number; system?: string } = {},
): Promise<string> {
  if (!(await withinBudget())) {
    throw new BudgetExceededError();
  }

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: options.maxTokens ?? 1024,
    system: options.system,
    messages: [{ role: "user", content: userMessage }],
  });

  await incrementUsage();

  return response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
}
