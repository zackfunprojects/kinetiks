/**
 * Anthropic Models API wrapper — the live source of truth for "what
 * models exist right now". Used by the model-discovery cron to detect
 * when a newer model has shipped in a role's family.
 *
 * Kept inside @kinetiks/ai (the only place that touches the Anthropic
 * SDK) so feature code never imports `@anthropic-ai/sdk` directly, per
 * CLAUDE.md. This is a cheap metadata read (no tokens, no generation),
 * so it does NOT write an ai_calls row — that ledger is for message
 * generations.
 */

import { createClaudeClient } from "./claude";

export interface AnthropicModelInfo {
  id: string;
  /** Release timestamp as epoch ms when the API supplies `created_at`. */
  createdAtMs: number | null;
  displayName: string | null;
}

interface RawModel {
  id?: unknown;
  created_at?: unknown;
  display_name?: unknown;
}

function toMs(created: unknown): number | null {
  if (typeof created === "number" && Number.isFinite(created)) {
    // The SDK returns seconds for created_at; normalize to ms.
    return created < 1e12 ? created * 1000 : created;
  }
  if (typeof created === "string") {
    const t = Date.parse(created);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/**
 * List every model the API account can see, normalized. Pages through
 * the full list (model lists are small). Errors propagate to the caller
 * (the discovery route), which fails the run loudly rather than acting
 * on a partial list.
 */
export async function listAnthropicModels(apiKey?: string): Promise<AnthropicModelInfo[]> {
  const client = createClaudeClient(apiKey);
  const out: AnthropicModelInfo[] = [];
  // The SDK's models.list() is auto-paginating async-iterable.
  for await (const model of client.models.list({ limit: 100 })) {
    const raw = model as RawModel;
    if (typeof raw.id !== "string") continue;
    out.push({
      id: raw.id,
      createdAtMs: toMs(raw.created_at),
      displayName: typeof raw.display_name === "string" ? raw.display_name : null,
    });
  }
  return out;
}
