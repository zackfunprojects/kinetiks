/**
 * Runtime types for the @kinetiks/tools package.
 *
 * Pure descriptor types (ToolDescriptor, ActionClassDescriptor,
 * OperatorDescriptor) live in `@kinetiks/types`. This file adds:
 *  - `AgentTool` — descriptor + execute behavior
 *  - Execution context, error taxonomy, log payload, logger shape
 */

import type {
  ToolDescriptor,
  AvailabilityPredicate,
} from "@kinetiks/types";

// ============================================================
// AgentTool — descriptor + behavior
// ============================================================

export interface ToolExecutionContext {
  accountId: string;
  userId?: string | null;
  /** v2 placeholder; always null in v1. */
  teamScopeId?: string | null;

  /** Correlation: which agent / thread / run invoked this. */
  invokedByAgent: string;
  correlationId?: string | null;
  threadId?: string | null;
  agentRunId?: string | null;

  /** Linkage: associated proposal / approval / grant / pattern. */
  parentAiCallId?: string | null;
  proposalId?: string | null;
  approvalId?: string | null;
  grantId?: string | null;
  patternId?: string | null;

  /** Caller-supplied free-form context (ids and primitives only; no PII). */
  metadata?: ToolMetadata;

  /** Cancellation signal. */
  signal?: AbortSignal;
}

/** Strict, PII-free metadata shape: primitives + string arrays only. */
export type ToolMetadata = Record<string, string | number | boolean | string[]>;

/**
 * A runnable agent tool.
 *
 * The generic `TInput` / `TOutput` types are inferred from the Zod
 * input/output schemas at the call site (see `defineTool`).
 */
export interface AgentTool<TInput = unknown, TOutput = unknown> extends ToolDescriptor {
  /**
   * Derive a stable idempotency key from the input. REQUIRED when
   * `isConsequential` is true so retries don't double-send.
   */
  idempotencyKeyFrom?: (input: TInput) => string;
  /**
   * Optional custom availability predicate when `availability.kind === "custom"`.
   * Returns true if the tool is available to the given account.
   */
  customAvailability?: (ctx: AvailabilityContext) => Promise<boolean>;
  /** The actual implementation. Runs inside the Agent Runtime in F2. */
  execute: (input: TInput, ctx: ToolExecutionContext) => Promise<TOutput>;
}

export interface AvailabilityContext {
  accountId: string;
  userId?: string | null;
}

// ============================================================
// Error taxonomy
// ============================================================

export type ToolErrorClass =
  | "invalid_input"           // input failed inputSchema validation
  | "invalid_output"          // execute returned data that failed outputSchema
  | "unavailable"             // availability predicate denied
  | "missing_action_class"    // consequential tool referenced an unregistered class
  | "denied_by_authority"     // authority resolution refused (F2 fills this in)
  | "queued_for_approval"     // surfaced; not really an error, but execute did not run
  | "rate_limited"            // rate limit hit (F2 fills this in)
  | "configuration_error"     // tool itself misconfigured
  | "transient"               // upstream transient failure
  | "permanent"               // upstream permanent failure
  | "timeout"
  | "aborted"
  | "internal_error";

export class ToolError extends Error {
  readonly errorClass: ToolErrorClass;
  readonly userMessage: string;
  readonly status: number;
  readonly context: Record<string, string | number | boolean | string[]>;

  constructor(
    errorClass: ToolErrorClass,
    message: string,
    options: {
      cause?: unknown;
      userMessage?: string;
      status?: number;
      context?: Record<string, string | number | boolean | string[]>;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ToolError";
    this.errorClass = errorClass;
    this.userMessage = options.userMessage ?? defaultUserMessage(errorClass);
    this.status = options.status ?? defaultStatus(errorClass);
    this.context = options.context ?? {};
  }
}

function defaultUserMessage(c: ToolErrorClass): string {
  switch (c) {
    case "invalid_input":
    case "invalid_output":
      return "We couldn't run that with the values provided.";
    case "unavailable":
      return "That capability isn't available on your account.";
    case "missing_action_class":
    case "configuration_error":
      return "Something is misconfigured on our end. We've been notified.";
    case "denied_by_authority":
      return "That action isn't authorized right now.";
    case "queued_for_approval":
      return "I queued that for your approval.";
    case "rate_limited":
      return "We've hit a rate limit. Try again shortly.";
    case "timeout":
      return "The request took too long. Try again.";
    case "aborted":
      return "Cancelled.";
    default:
      return "Something went wrong. Try again.";
  }
}

function defaultStatus(c: ToolErrorClass): number {
  switch (c) {
    case "invalid_input":
    case "invalid_output":
      return 400;
    case "unavailable":
      return 403;
    case "denied_by_authority":
      return 403;
    case "queued_for_approval":
      return 202;
    case "rate_limited":
      return 429;
    case "timeout":
      return 504;
    case "missing_action_class":
    case "configuration_error":
      return 500;
    case "transient":
      return 502;
    case "permanent":
    case "internal_error":
    default:
      return 500;
  }
}

// ============================================================
// Tool-call log payload (one row per execution attempt)
// ============================================================

export type ToolCallStatus = "success" | "error" | "denied" | "queued_for_approval";
export type AuthorityOutcome =
  | "grant_covers"
  | "auto_threshold"
  | "queued"
  | "escalated"
  | "fallback"
  | "denied";

export interface ToolCallLogPayload {
  toolName: string;
  toolVersion?: string | null;
  isConsequential: boolean;
  actionClass?: string | null;
  invokedByAgent: string;
  parentAiCallId?: string | null;
  idempotencyKey?: string | null;

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

  status: ToolCallStatus;
  errorClass?: ToolErrorClass | null;
  errorMessage?: string | null;
  authorityOutcome?: AuthorityOutcome | null;

  latencyMs: number;
  startedAt: string;
  completedAt: string;

  metadata: ToolMetadata;
}

export type ToolCallLogger = (payload: ToolCallLogPayload) => Promise<void> | void;

// ============================================================
// Re-export the underlying AvailabilityPredicate type for convenience
// ============================================================

export type { AvailabilityPredicate };
