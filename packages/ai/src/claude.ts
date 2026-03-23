import Anthropic from "@anthropic-ai/sdk";

/**
 * Cache keyed by API key to avoid creating new clients on every call,
 * while ensuring BYOK users never share a client with other users.
 */
const clientCache = new Map<string, Anthropic>();

export function createClaudeClient(apiKey?: string): Anthropic {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }

  const cached = clientCache.get(key);
  if (cached) return cached;

  const newClient = new Anthropic({ apiKey: key });
  clientCache.set(key, newClient);
  return newClient;
}

interface AskClaudeOptions {
  system?: string;
  model?: "claude-sonnet-4-20250514" | "claude-haiku-4-5-20251001";
  maxTokens?: number;
  apiKey?: string;
}

export async function askClaude(
  prompt: string,
  options: AskClaudeOptions = {}
): Promise<string> {
  const {
    system,
    model = "claude-sonnet-4-20250514",
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
  model?: "claude-sonnet-4-20250514" | "claude-haiku-4-5-20251001";
  maxTokens?: number;
  apiKey?: string;
}

export async function askClaudeMultiTurn(
  messages: ConversationMessage[],
  options: AskClaudeMultiTurnOptions = {}
): Promise<string> {
  const {
    system,
    model = "claude-sonnet-4-20250514",
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
  model?: "claude-sonnet-4-20250514" | "claude-haiku-4-5-20251001";
  maxTokens?: number;
  apiKey?: string;
}

export function streamClaude(
  messages: ConversationMessage[],
  options: StreamClaudeOptions = {}
) {
  const {
    system,
    model = "claude-sonnet-4-20250514",
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
