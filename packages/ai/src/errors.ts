/**
 * Canonical error types surfaced by the @kinetiks/ai router.
 *
 * Per CLAUDE.md, configuration_error and rate_limited must be distinguished:
 *  - configuration_error → 500, captured to Sentry
 *  - rate_limited → 429, NOT captured to Sentry
 *  - transient/permanent → retry once, then surface a generic user-safe error
 *
 * Never interpolate the raw upstream error message into a response — the
 * UI shows the generic message, Sentry receives structured context.
 */

export type AIErrorClass =
  | "configuration_error"
  | "rate_limited"
  | "transient"
  | "permanent"
  | "missing_prompt"
  | "pii_violation"
  | "timeout";

export interface AIErrorOptions {
  cause?: unknown;
  /** Generic, user-safe message; never includes raw upstream content or PII. */
  userMessage?: string;
  /** HTTP status when surfaced via an API route. */
  status?: number;
  /** Free-form structured context for Sentry (PII-free, ids only). */
  context?: Record<string, string | number | boolean | string[]>;
}

export class AITaskError extends Error {
  readonly errorClass: AIErrorClass;
  readonly userMessage: string;
  readonly status: number;
  readonly context: Record<string, string | number | boolean | string[]>;

  constructor(errorClass: AIErrorClass, message: string, options: AIErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "AITaskError";
    this.errorClass = errorClass;
    this.userMessage = options.userMessage ?? defaultUserMessage(errorClass);
    this.status = options.status ?? defaultStatus(errorClass);
    this.context = options.context ?? {};
  }
}

function defaultUserMessage(c: AIErrorClass): string {
  switch (c) {
    case "rate_limited":
      return "We're being rate-limited right now. Try again in a moment.";
    case "configuration_error":
      return "Something is misconfigured on our end. We've been notified.";
    case "missing_prompt":
      return "Something is misconfigured on our end. We've been notified.";
    case "pii_violation":
      return "We can't include that content in an AI request.";
    case "timeout":
      return "The request took too long. Try again.";
    case "transient":
    case "permanent":
    default:
      return "Something went wrong. Try again.";
  }
}

function defaultStatus(c: AIErrorClass): number {
  switch (c) {
    case "rate_limited":
      return 429;
    case "missing_prompt":
    case "configuration_error":
      return 500;
    case "pii_violation":
      return 400;
    case "timeout":
      return 504;
    case "transient":
      return 502;
    case "permanent":
    default:
      return 500;
  }
}

/** Classify an unknown thrown value into our error taxonomy. */
export function classifyError(err: unknown): AIErrorClass {
  if (err instanceof AITaskError) return err.errorClass;
  const status = readStatus(err);
  if (status === 401 || status === 403) return "configuration_error";
  if (status === 429) return "rate_limited";
  if (status === 408 || status === 504) return "timeout";
  if (typeof status === "number" && status >= 500) return "transient";
  if (typeof status === "number" && status >= 400) return "permanent";
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (message.includes("rate limit")) return "rate_limited";
  if (message.includes("timeout") || message.includes("etimedout")) return "timeout";
  if (message.includes("missing") && message.includes("api key")) return "configuration_error";
  return "transient";
}

function readStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as Record<string, unknown>;
  if (typeof e.status === "number") return e.status;
  const response = e.response as Record<string, unknown> | undefined;
  if (response && typeof response.status === "number") return response.status;
  return undefined;
}
