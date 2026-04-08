/**
 * Lens LLM client wrapper.
 *
 * Calls Anthropic's Messages API directly via fetch — no SDK
 * dependency, so this PR doesn't add new packages. Claude Haiku is
 * the default model because the prompts are short, the response is
 * a single JSON object, and latency matters more than reasoning
 * depth for the three Lens checks (tone / redundancy / question
 * responsiveness).
 *
 * Failure modes (all → throw, which the engine swallows into a
 * "skipped" row):
 *   - missing ANTHROPIC_API_KEY                  → throws synchronously
 *   - request rejects (network / 4xx / 5xx)      → throws
 *   - response body cannot be parsed             → throws
 *   - exceeds LENS_LLM_TIMEOUT_MS                → AbortError → throws
 *
 * The engine in @kinetiks/deskof catches everything in Promise.allSettled
 * so a single LLM failure never blocks any check from running.
 */
import "server-only";
import type { LensLLM } from "@kinetiks/deskof";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const LENS_LLM_TIMEOUT_MS = 4000;

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

export function getLensLLM(): LensLLM | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  return {
    async complete({ system, user, maxTokens }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LENS_LLM_TIMEOUT_MS);
      try {
        const res = await fetch(ANTHROPIC_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: DEFAULT_MODEL,
            max_tokens: maxTokens ?? 200,
            system,
            messages: [{ role: "user", content: user }],
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Anthropic API ${res.status}`);
        }
        const json = (await res.json()) as AnthropicResponse;
        const text = json.content?.find((c) => c.type === "text")?.text;
        if (!text) {
          throw new Error("Anthropic response missing text content");
        }
        return text;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
