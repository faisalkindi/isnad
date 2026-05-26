// Backwards-compat shim. New code should import from `./llm` directly.
// All call sites that used `callClaude` and `BudgetExceededError` continue to
// work; under the hood they now route through the LLM abstraction in `llm.ts`,
// which can be pointed at Anthropic or OpenRouter via env vars.

export { BudgetExceededError, withinBudget } from "./llm";
import { callLLM } from "./llm";

/** @deprecated Use `callLLM` from `./llm` instead. Same signature. */
export async function callClaude(
  userMessage: string,
  options: { maxTokens?: number; system?: string } = {},
): Promise<string> {
  return callLLM(userMessage, options);
}
