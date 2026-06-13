/**
 * AI Router — the only sanctioned entry point for Anthropic calls.
 *
 * Per CLAUDE.md:
 *  - Every AI call goes through the router.
 *  - Every call writes one ai_calls row (retries are separate rows).
 *  - Errors classify into a fixed taxonomy (configuration_error vs
 *    rate_limited vs transient/permanent vs missing_prompt).
 *  - PII never enters the metadata payload; ids only.
 *  - Prompt-task identifiers must be registered before use.
 *
 * The router is intentionally agnostic to where ai_calls rows land — it
 * delegates to a pluggable AICallLogger that the app wires up at startup.
 * Tests can register an in-memory logger; production wires the Supabase
 * service-role client.
 */

import { createClaudeClient } from "./claude";
import { AITaskError, classifyError, type AIErrorClass } from "./errors";
import { assertPromptTask } from "./prompts-registry";
import { resolveModel, type ModelId, type ModelRole } from "./models";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * A concrete Anthropic model id. Dynamic now (roles resolve to whatever
 * is current), so a string rather than a closed union. Retained as a
 * named export for back-compat; new code should reason in `ModelRole`.
 */
export type AIModel = ModelId;

/** Correlation envelope: ids only, no payloads, no PII. */
export interface AICallContext {
  accountId?: string | null;
  userId?: string | null;
  teamScopeId?: string | null;
  correlationId?: string | null;
  threadId?: string | null;
  agentRunId?: string | null;
  proposalId?: string | null;
  approvalId?: string | null;
  grantId?: string | null;
  patternId?: string | null;
  toolCallId?: string | null;
  parentCallId?: string | null;
}

export interface AICallLogPayload {
  task: string;
  model: AIModel;
  promptVersion?: string;
  attemptNumber: number;
  parentCallId?: string | null;

  status: "success" | "error" | "rate_limited" | "configuration_error" | "timeout";
  errorClass?: AIErrorClass;
  errorMessage?: string;

  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;

  latencyMs: number;
  startedAt: string;
  completedAt: string;

  context: AICallContext;
  /** Typed metadata: primitives and string arrays only. */
  metadata: AICallMetadata;
}

export type AICallMetadata = Record<string, string | number | boolean | string[]>;

export type AICallLogger = (payload: AICallLogPayload) => Promise<void> | void;

let _logger: AICallLogger | null = null;

export function configureAICallLogger(logger: AICallLogger | null): void {
  _logger = logger;
}

export function getAICallLogger(): AICallLogger | null {
  return _logger;
}

async function emitLog(payload: AICallLogPayload): Promise<void> {
  const logger = _logger;
  if (!logger) {
    // Loud warning in development; never block the call path
    // eslint-disable-next-line no-console
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[ai-router] no logger configured; dropping ai_calls row for task=${payload.task}`);
    }
    return;
  }
  try {
    await logger(payload);
  } catch (e) {
    // Logger failures must not break the call path
    // eslint-disable-next-line no-console
    console.warn("[ai-router] logger failed", e);
  }
}

interface RouteOptions {
  context?: AICallContext;
  metadata?: AICallMetadata;
  /** Pin a concrete model, overriding the task's role resolution. Escape
   *  hatch only — prefer letting the role resolve to the current model. */
  model?: AIModel;
  maxTokens?: number;
  apiKey?: string;
  /** Retry on transient/timeout once. Default true. */
  retry?: boolean;
}

/**
 * Stamp the resolved model role into the call's metadata so every
 * ai_calls row records which role drove the model choice — the audit
 * trail for "which role used which model when" once models start flipping.
 */
function withModelRole(options: RouteOptions, role: ModelRole): RouteOptions {
  return {
    ...options,
    metadata: { ...(options.metadata ?? {}), model_role: role },
  };
}

/**
 * Single-turn: pass a system prompt + user prompt, get back text.
 */
export async function routeAskClaude(
  task: string,
  prompt: string,
  system: string | undefined,
  options: RouteOptions = {},
): Promise<string> {
  const descriptor = assertPromptTask(task);
  const model = options.model ?? resolveModel(descriptor.role);
  const opts = withModelRole(options, descriptor.role);
  return runWithRetry(task, model, descriptor.version, opts, async (attempt) => {
    const anthropic = createClaudeClient(options.apiKey);
    const response = await anthropic.messages.create({
      model,
      max_tokens: options.maxTokens ?? 4096,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new AITaskError("permanent", "No text response from Claude", {
        context: { task, attempt },
      });
    }
    return {
      result: textBlock.text,
      usage: {
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        cacheReadTokens: response.usage?.cache_read_input_tokens ?? undefined,
        cacheWriteTokens: response.usage?.cache_creation_input_tokens ?? undefined,
      },
    };
  });
}

/**
 * Multi-turn non-streaming.
 */
export async function routeAskClaudeMultiTurn(
  task: string,
  messages: ConversationMessage[],
  system: string | undefined,
  options: RouteOptions = {},
): Promise<string> {
  const descriptor = assertPromptTask(task);
  const model = options.model ?? resolveModel(descriptor.role);
  const opts = withModelRole(options, descriptor.role);
  return runWithRetry(task, model, descriptor.version, opts, async (attempt) => {
    const anthropic = createClaudeClient(options.apiKey);
    const response = await anthropic.messages.create({
      model,
      max_tokens: options.maxTokens ?? 4096,
      ...(system ? { system } : {}),
      messages,
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new AITaskError("permanent", "No text response from Claude", {
        context: { task, attempt },
      });
    }
    return {
      result: textBlock.text,
      usage: {
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        cacheReadTokens: response.usage?.cache_read_input_tokens ?? undefined,
        cacheWriteTokens: response.usage?.cache_creation_input_tokens ?? undefined,
      },
    };
  });
}

interface RouterUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

interface RunResult<T> {
  result: T;
  usage: RouterUsage;
}

async function runWithRetry<T>(
  task: string,
  model: AIModel,
  promptVersion: string,
  options: RouteOptions,
  fn: (attempt: number) => Promise<RunResult<T>>,
): Promise<T> {
  const shouldRetry = options.retry !== false;
  const maxAttempts = shouldRetry ? 2 : 1;

  let attempt = 0;
  let lastError: AITaskError | null = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    const startedAt = new Date();
    const startMs = performance.now();
    try {
      const { result, usage } = await fn(attempt);
      const completedAt = new Date();
      await emitLog({
        task,
        model,
        promptVersion,
        attemptNumber: attempt,
        parentCallId: options.context?.parentCallId,
        status: "success",
        latencyMs: Math.round(performance.now() - startMs),
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        context: options.context ?? {},
        metadata: options.metadata ?? {},
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
      });
      return result;
    } catch (raw) {
      const errorClass = classifyError(raw);
      const wrapped =
        raw instanceof AITaskError
          ? raw
          : new AITaskError(errorClass, errorClass, {
              cause: raw,
              context: { task, attempt },
            });
      lastError = wrapped;
      const completedAt = new Date();
      await emitLog({
        task,
        model,
        promptVersion,
        attemptNumber: attempt,
        parentCallId: options.context?.parentCallId,
        status: mapStatus(errorClass),
        errorClass,
        errorMessage: genericErrorMessage(errorClass),
        latencyMs: Math.round(performance.now() - startMs),
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        context: options.context ?? {},
        metadata: options.metadata ?? {},
      });

      // Never retry configuration errors, rate limits, or permanent failures.
      const retryable = errorClass === "transient" || errorClass === "timeout";
      if (!shouldRetry || !retryable || attempt >= maxAttempts) {
        throw wrapped;
      }
      // Brief backoff before retry; jittered.
      await sleep(150 + Math.floor(Math.random() * 250));
    }
  }
  // Should be unreachable; if we got here, throw the last error
  throw lastError ?? new AITaskError("permanent", "Exhausted retries", { context: { task } });
}

/**
 * Streaming variant. Returns the underlying Anthropic SDK stream so the
 * caller can attach `text` / `finalMessage` / `error` listeners exactly
 * as they would with the legacy `streamClaude`. The router taps the
 * same events internally to write one `ai_calls` row on completion or
 * error.
 *
 * Note: streaming does not retry. A failed stream surfaces immediately.
 * (Retrying mid-stream would deliver duplicate deltas to the caller.)
 */
export function routeStreamClaude(
  task: string,
  messages: ConversationMessage[],
  system: string | undefined,
  options: Omit<RouteOptions, "retry"> = {},
) {
  const descriptor = assertPromptTask(task);
  const model = options.model ?? resolveModel(descriptor.role);
  const promptVersion = descriptor.version;
  const metadata: AICallMetadata = {
    ...(options.metadata ?? {}),
    model_role: descriptor.role,
  };
  const anthropic = createClaudeClient(options.apiKey);
  const startedAt = new Date();
  const startMs = performance.now();
  const stream = anthropic.messages.stream({
    model,
    max_tokens: options.maxTokens ?? 4096,
    ...(system ? { system } : {}),
    messages,
  });

  // Tap finalMessage for success logging. Caller's own listeners stay attached.
  stream.on("finalMessage", (msg) => {
    const completedAt = new Date();
    void emitLog({
      task,
      model,
      promptVersion,
      attemptNumber: 1,
      parentCallId: options.context?.parentCallId,
      status: "success",
      latencyMs: Math.round(performance.now() - startMs),
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      context: options.context ?? {},
      metadata,
      inputTokens: msg.usage?.input_tokens,
      outputTokens: msg.usage?.output_tokens,
      cacheReadTokens: msg.usage?.cache_read_input_tokens ?? undefined,
      cacheWriteTokens: msg.usage?.cache_creation_input_tokens ?? undefined,
    });
  });

  stream.on("error", (err: unknown) => {
    const errorClass = classifyError(err);
    const completedAt = new Date();
    void emitLog({
      task,
      model,
      promptVersion,
      attemptNumber: 1,
      parentCallId: options.context?.parentCallId,
      status: mapStatus(errorClass),
      errorClass,
      errorMessage: genericErrorMessage(errorClass),
      latencyMs: Math.round(performance.now() - startMs),
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      context: options.context ?? {},
      metadata,
    });
  });

  return stream;
}

function mapStatus(c: AIErrorClass): AICallLogPayload["status"] {
  switch (c) {
    case "rate_limited":
      return "rate_limited";
    case "configuration_error":
    case "missing_prompt":
      return "configuration_error";
    case "timeout":
      return "timeout";
    default:
      return "error";
  }
}

function genericErrorMessage(c: AIErrorClass): string {
  switch (c) {
    case "rate_limited":
      return "rate_limited";
    case "configuration_error":
      return "configuration_error";
    case "missing_prompt":
      return "missing_prompt";
    case "timeout":
      return "timeout";
    case "transient":
      return "transient_upstream";
    case "permanent":
      return "permanent_upstream";
    case "pii_violation":
      return "pii_violation";
    default:
      return "unknown";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
