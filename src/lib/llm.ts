// LLM abstraction layer — picks Anthropic or OpenRouter based on env vars.
//
// Selection rules (in `.env.local`):
//   LLM_PROVIDER=anthropic   → uses Anthropic API directly with ANTHROPIC_API_KEY
//   LLM_PROVIDER=openrouter  → uses OpenRouter with OPENROUTER_API_KEY
//
//   LLM_MODEL=<model id>     → overrides the default model for the provider
//                              e.g., "claude-sonnet-4-6" (Anthropic)
//                                    "qwen/qwen3.6-flash" (OpenRouter)
//                                    "deepseek/deepseek-v4-flash" (OpenRouter)
//
// Default: anthropic + claude-sonnet-4-6 (preserves existing behavior).
//
// All providers expose the same call surface (`callLLM`), so the rest of the
// app doesn't need to know which one is active. Spend-cap and usage tracking
// (`withinBudget`, `incrementUsage`) are provider-agnostic.

import Anthropic from "@anthropic-ai/sdk";
import { query } from "./db";

/** Thrown when the monthly LLM call cap has been reached. */
export class BudgetExceededError extends Error {
  constructor() {
    super("Monthly LLM API call cap reached");
    this.name = "BudgetExceededError";
  }
}

type Provider = "anthropic" | "openrouter" | "deepseek";

const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-6",
  openrouter: "qwen/qwen3.6-flash",
  // DeepSeek's V4 Pro endpoint; cheapest first-party rate ($0.435/M in,
  // $0.87/M out, $0.0036/M on cache hit). Verified via api-docs.deepseek.com.
  deepseek: "deepseek-v4-pro",
};

// Resolved per-call so tests / runtime env changes take effect without a
// module reload. This is the boundary that decides which provider runs.
function resolveProvider(): Provider {
  const raw = process.env.LLM_PROVIDER;
  if (raw === "openrouter" || raw === "deepseek") return raw;
  return "anthropic";
}
function resolveModel(provider: Provider): string {
  return process.env.LLM_MODEL ?? DEFAULT_MODEL[provider];
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

function monthlyCap(): number {
  return Number(process.env.CLAUDE_MONTHLY_CAP ?? "5000");
}

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

// ----- Anthropic (Sonnet etc.) -----

let anthropicClient: Anthropic | undefined;
function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

async function callAnthropic(
  userMessage: string,
  options: { maxTokens?: number; system?: string },
): Promise<string> {
  const response = await getAnthropicClient().messages.create({
    model: resolveModel("anthropic"),
    max_tokens: options.maxTokens ?? 1024,
    system: options.system,
    messages: [{ role: "user", content: userMessage }],
  });
  return response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
}

// ----- OpenRouter (Qwen, DeepSeek, etc.) -----

async function callOpenRouter(
  userMessage: string,
  options: { maxTokens?: number; system?: string },
): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  // Some OpenRouter models default to "thinking" mode which produces 10-20x
  // more output tokens. We don't need extended reasoning for structured
  // segmentation, so disable it when the provider supports the toggle.
  const body: Record<string, unknown> = {
    model: resolveModel("openrouter"),
    max_tokens: options.maxTokens ?? 1024,
    messages: options.system
      ? [
          { role: "system", content: options.system },
          { role: "user", content: userMessage },
        ]
      : [{ role: "user", content: userMessage }],
    // Disable thinking mode for Qwen/etc. — OpenRouter normalizes this field.
    reasoning: { enabled: false },
  };
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      // OpenRouter recommends identifying the app for traffic prioritization.
      // ASCII-only to avoid header byte-string issues.
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://isnad.online",
      "X-Title": "Isnad app",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(
      `OpenRouter returned no text content. Body: ${JSON.stringify(data).slice(0, 300)}`,
    );
  }
  return content;
}

// ----- DeepSeek (first-party, cheapest V4 Pro route) -----
// OpenAI-compatible chat completions. Base URL + model names verified at
// api-docs.deepseek.com (https://api.deepseek.com/chat/completions).
// Cache hits ($0.0036/M input vs $0.435/M miss) are automatic — server-side
// detects shared prefixes; nothing to configure here.
async function callDeepSeek(
  userMessage: string,
  options: { maxTokens?: number; system?: string },
): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    throw new Error("DEEPSEEK_API_KEY is not set");
  }
  const body: Record<string, unknown> = {
    model: resolveModel("deepseek"),
    max_tokens: options.maxTokens ?? 1024,
    messages: options.system
      ? [
          { role: "system", content: options.system },
          { role: "user", content: userMessage },
        ]
      : [{ role: "user", content: userMessage }],
    stream: false,
    // V4 Pro defaults to thinking-on which burns ~10× output tokens and can
    // truncate our JSON within max_tokens. We do pure structured extraction,
    // not multi-step reasoning, so opt into non-thinking mode.
    // Docs: api-docs.deepseek.com/api_samples/thinking_mode_api_example_*.
    thinking: { type: "disabled" },
  };
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(
      `DeepSeek returned no text content. Body: ${JSON.stringify(data).slice(0, 300)}`,
    );
  }
  return content;
}

/**
 * Send one user message to the active LLM and return its text reply.
 * Enforces the monthly call cap; increments the counter on success.
 */
export async function callLLM(
  userMessage: string,
  options: { maxTokens?: number; system?: string } = {},
): Promise<string> {
  if (!(await withinBudget())) {
    throw new BudgetExceededError();
  }
  const provider = resolveProvider();
  let reply: string;
  if (provider === "openrouter") {
    reply = await callOpenRouter(userMessage, options);
  } else if (provider === "deepseek") {
    reply = await callDeepSeek(userMessage, options);
  } else {
    reply = await callAnthropic(userMessage, options);
  }
  await incrementUsage();
  return reply;
}

/** Return which provider/model is active — handy for /api/status or
 *  diagnostics. */
export function activeModel(): { provider: Provider; model: string } {
  const provider = resolveProvider();
  return { provider, model: resolveModel(provider) };
}
