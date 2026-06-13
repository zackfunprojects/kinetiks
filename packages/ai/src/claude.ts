import Anthropic from "@anthropic-ai/sdk";

import { resolveModel, type ModelId, type ModelRole } from "./models";

/**
 * Cached client for the shared env key only.
 * BYOK (user-supplied) keys are never cached to avoid unbounded memory
 * growth and retaining user secrets longer than necessary.
 */
let envClient: Anthropic | null = null;
let envClientKey: string | null = null;

export function createClaudeClient(apiKey?: string): Anthropic {
  const key: string = apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
  if (!key) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }

  // User-supplied BYOK key: create fresh client, never cache
  if (apiKey) {
    return new Anthropic({ apiKey: key });
  }

  // Shared env key: cache a singleton
  if (envClient && envClientKey === key) return envClient;

  envClient = new Anthropic({ apiKey: key });
  envClientKey = key;
  return envClient;
}

interface AskClaudeOptions {
  system?: string;
  /** Model ROLE to run at (resolves to the current model id). Defaults
   *  to `balanced`. Prefer this over pinning a concrete `model`. */
  role?: ModelRole;
  /** Escape hatch: pin a concrete model id, overriding `role`. */
  model?: ModelId;
  maxTokens?: number;
  apiKey?: string;
}

export async function askClaude(
  prompt: string,
  options: AskClaudeOptions = {}
): Promise<string> {
  const {
    system,
    role = "balanced",
    model = resolveModel(role),
    maxTokens = 4096,
    apiKey,
  } = options;

  const anthropic = createClaudeClient(apiKey);

  const message = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  return textBlock.text;
}

// ============================================================
// Multi-turn conversation (non-streaming)
// ============================================================

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface AskClaudeMultiTurnOptions {
  system?: string;
  role?: ModelRole;
  model?: ModelId;
  maxTokens?: number;
  apiKey?: string;
}

export async function askClaudeMultiTurn(
  messages: ConversationMessage[],
  options: AskClaudeMultiTurnOptions = {}
): Promise<string> {
  const {
    system,
    role = "balanced",
    model = resolveModel(role),
    maxTokens = 4096,
    apiKey,
  } = options;

  const anthropic = createClaudeClient(apiKey);

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  return textBlock.text;
}

// ============================================================
// Streaming multi-turn conversation
// ============================================================

interface StreamClaudeOptions {
  system?: string;
  role?: ModelRole;
  model?: ModelId;
  maxTokens?: number;
  apiKey?: string;
}

export function streamClaude(
  messages: ConversationMessage[],
  options: StreamClaudeOptions = {}
) {
  const {
    system,
    role = "balanced",
    model = resolveModel(role),
    maxTokens = 4096,
    apiKey,
  } = options;

  const anthropic = createClaudeClient(apiKey);

  return anthropic.messages.stream({
    model,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages,
  });
}

export type { ConversationMessage, StreamClaudeOptions };
