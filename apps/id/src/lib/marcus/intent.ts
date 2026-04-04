import { askClaude } from "@kinetiks/ai";
import type { MarcusIntent } from "@kinetiks/types";

const INTENT_PROMPT = `You are an intent classifier for Marcus, a strategic AI advisor. Classify the user's message into exactly one intent category.

Categories:
- command: Direct commands to connected apps - "show me reply rates", "build a sequence for X", "pause all outbound", "send an email to", "create a draft about". Actions that should be dispatched to a specific app's Synapse.
- strategic: Cross-app questions, business direction, planning, "what should I focus on", market positioning, competitive strategy
- tactical: Specific requests that Marcus handles directly - "update my positioning", "help me think about X"
- support: Product questions about Kinetiks, how-to questions, feature explanations, troubleshooting
- data_query: Requests for specific data, "what's my confidence score", "show me recent proposals", metrics, stats
- implicit_intel: User sharing information that contains business intelligence - deal outcomes, market observations, competitor news, strategy changes. The user is talking, not asking.

Respond with ONLY the category name, nothing else.`;

/**
 * Classify user message intent to determine context assembly budget.
 * Uses Haiku for speed - this should be fast.
 */
export async function classifyIntent(
  message: string,
  recentMessages?: string[]
): Promise<MarcusIntent> {
  const context = recentMessages?.length
    ? `\nRecent conversation:\n${recentMessages.slice(-3).join("\n")}\n\nLatest message:`
    : "";

  const result = await askClaude(`${context}\n${message}`, {
    system: INTENT_PROMPT,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 20,
  });

  const intent = result.trim().toLowerCase() as MarcusIntent;

  const validIntents: MarcusIntent[] = [
    "command",
    "strategic",
    "tactical",
    "support",
    "data_query",
    "implicit_intel",
  ];

  if (validIntents.includes(intent)) {
    return intent;
  }

  // Default to strategic if classification fails
  return "strategic";
}
