/**
 * Public surface types for the Agent Runtime.
 *
 * The Runtime is the seam between agents (Marcus, Cartographer, Oracle,
 * Archivist, Authority Agent, suite-app operators) and the platform.
 * Every consequential tool invocation flows through `AgentRun.invokeTool`
 * so authority resolution, retry, timeout, and cost accounting happen in
 * exactly one place.
 */

import type {
  AgentTool,
  AuthorityOutcome,
  AvailabilityResolvers,
  ExecuteToolOptions,
  ToolErrorClass,
  ToolMetadata,
} from "@kinetiks/tools";

export interface RunOptions {
  /** Required: account scope for every tool call. */
  accountId: string;
  /** Optional: authenticated user. Forwarded to tool_calls.user_id. */
  userId?: string | null;
  /** v2 placeholder; always null in v1. */
  teamScopeId?: string | null;

  /** Required: who is invoking. e.g. "marcus", "oracle", "cartographer", "hv.scout". */
  invokedByAgent: string;

  /** Optional correlation ids — propagated to every tool_calls row. */
  correlationId?: string | null;
  threadId?: string | null;
  parentAiCallId?: string | null;

  /** Default per-call timeout. Caller may override per invokeTool. */
  timeoutMs?: number;

  /** Retry policy for transient errors. Default: 1 retry. */
  retry?: RetryPolicy;

  /** Tool availability resolvers. Required when any tool declares non-`always` availability. */
  availability?: AvailabilityResolvers;

  /** Optional idempotency dedup hook, passed through to F1's executor. */
  idempotency?: ExecuteToolOptions["idempotency"];

  /** External AbortSignal that cancels the whole run. */
  signal?: AbortSignal;

  /** Defaults applied to every invokeTool's metadata if the caller does not supply one. */
  metadataDefaults?: ToolMetadata;
}

export interface RetryPolicy {
  /** Total attempts (including the initial). Default: 2 (one retry). */
  maxAttempts: number;
  /** Initial backoff in ms. Default: 200. Subsequent attempts back off exponentially with full jitter. */
  initialBackoffMs?: number;
  /** Maximum backoff cap. Default: 2000. */
  maxBackoffMs?: number;
  /** Override for which classes are considered retryable. Defaults to transient + timeout. */
  retryableClasses?: readonly ToolErrorClass[];
}

export interface InvokeToolOptions {
  /** Per-call timeout override. */
  timeoutMs?: number;
  /** Per-call retry override (full replacement). */
  retry?: RetryPolicy;
  /** Tool-call metadata; merged on top of `runOptions.metadataDefaults`. */
  metadata?: ToolMetadata;
  /** Tag this invocation with an approval/proposal/pattern id. */
  approvalId?: string;
  proposalId?: string;
  grantId?: string;
  patternId?: string;
  /** External AbortSignal override for this single call. */
  signal?: AbortSignal;
}

export interface RunSummary {
  runId: string;
  invokedByAgent: string;
  accountId: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  toolCalls: number;
  toolFailures: number;
  authorityOutcomes: Record<AuthorityOutcome | "none", number>;
  /** Names of every tool invoked, in order. */
  trace: ReadonlyArray<TraceEntry>;
}

export interface TraceEntry {
  toolName: string;
  status: "success" | "error" | "denied" | "queued_for_approval";
  errorClass?: ToolErrorClass;
  authorityOutcome?: AuthorityOutcome | null;
  attempt: number;
  latencyMs: number;
}

export type TypedTool<TIn, TOut> = AgentTool<TIn, TOut>;
