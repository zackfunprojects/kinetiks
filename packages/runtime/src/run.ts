/**
 * Agent Runtime — single legitimate path for invoking platform tools.
 *
 * Per CLAUDE.md and the Kinetiks Contract Addendum, every consequential action flows
 * through this Runtime so authority resolution, idempotency, retry,
 * timeout, and structured logging happen in exactly one place.
 *
 * Pattern:
 *
 *   const run = startAgentRun({
 *     accountId: "acc_1",
 *     invokedByAgent: "marcus",
 *     threadId: "t_1",
 *     availability: platformAvailabilityResolvers,
 *   });
 *   const out = await run.invokeTool(noopTestTool, { message: "hi" });
 *   const summary = run.summary();
 *
 * Wraps F1's `executeTool` with:
 *   - run lifecycle (id + summary)
 *   - F2 authority resolution stub (fills tool_calls.authority_outcome)
 *   - exponential-backoff retries on transient/timeout errors
 *   - per-call AbortSignal merged with the run-level signal
 *   - run-level cost/error aggregation
 */

import {
  ToolError,
  executeTool,
  type AgentTool,
  type AuthorityOutcome,
  type ToolExecutionContext,
  type ToolMetadata,
} from "@kinetiks/tools";
import {
  getAuthorityResolver,
  type AuthorityResolution,
  type ResolveAuthorityCtx,
} from "./authority";
import { AbortError, backoffMs, isRetryable, resolveRetryPolicy, sleep } from "./retry";
import type {
  InvokeToolOptions,
  RunOptions,
  RunSummary,
  TraceEntry,
} from "./types";

let _runCounter = 0;

function nextRunId(): string {
  // Short, sortable, collision-resistant enough for in-process runs.
  // The downstream tool_calls row uses uuid, so this id is for trace + logs only.
  _runCounter = (_runCounter + 1) % 1_000_000;
  return `run_${Date.now().toString(36)}_${_runCounter.toString(36)}`;
}

export class AgentRun {
  readonly runId: string;
  readonly accountId: string;
  readonly userId: string | null;
  readonly teamScopeId: string | null;
  readonly invokedByAgent: string;
  readonly correlationId: string | null;
  readonly threadId: string | null;
  readonly parentAiCallId: string | null;
  readonly startedAt: Date;

  private readonly options: RunOptions;
  private readonly trace: TraceEntry[] = [];
  private readonly authorityOutcomes: Record<AuthorityOutcome | "none", number> = {
    grant_covers: 0,
    auto_threshold: 0,
    queued: 0,
    escalated: 0,
    fallback: 0,
    denied: 0,
    none: 0,
  };
  private toolFailures = 0;
  private endedAt: Date | null = null;

  constructor(options: RunOptions) {
    this.options = options;
    this.runId = nextRunId();
    this.accountId = options.accountId;
    this.userId = options.userId ?? null;
    this.teamScopeId = options.teamScopeId ?? null;
    this.invokedByAgent = options.invokedByAgent;
    this.correlationId = options.correlationId ?? null;
    this.threadId = options.threadId ?? null;
    this.parentAiCallId = options.parentAiCallId ?? null;
    this.startedAt = new Date();
  }

  /**
   * Invoke a tool. Returns the typed output or throws a ToolError on
   * terminal failure. Logs one `tool_calls` row per attempt via F1's
   * executor (the row carries the resolved `authority_outcome`).
   */
  async invokeTool<TIn, TOut>(
    tool: AgentTool<TIn, TOut>,
    input: TIn,
    options: InvokeToolOptions = {},
  ): Promise<TOut> {
    const retry = resolveRetryPolicy(options.retry ?? this.options.retry);
    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs;
    const signal = mergeSignals(
      this.options.signal,
      options.signal,
      timeoutMs ?? null,
    );

    // Authority resolution happens once per logical call (not per retry).
    const authority = await getAuthorityResolver()(tool, this.resolveCtx());

    const baseMetadata: ToolMetadata = {
      ...(this.options.metadataDefaults ?? {}),
      ...(options.metadata ?? {}),
      agent_run_id: this.runId,
    };

    let attempt = 0;
    let lastError: ToolError | null = null;

    while (attempt < retry.maxAttempts) {
      attempt += 1;
      const t0 = performance.now();
      try {
        const execContext: ToolExecutionContext = {
          accountId: this.accountId,
          userId: this.userId,
          teamScopeId: this.teamScopeId,
          invokedByAgent: this.invokedByAgent,
          correlationId: this.correlationId,
          threadId: this.threadId,
          agentRunId: this.runId,
          parentAiCallId: this.parentAiCallId,
          proposalId: options.proposalId ?? null,
          approvalId: options.approvalId ?? null,
          grantId: options.grantId ?? authority.grantId ?? null,
          patternId: options.patternId ?? null,
          metadata: baseMetadata,
          signal,
        };
        const output = await executeTool(tool, input, execContext, {
          availability: this.options.availability,
          idempotency: this.options.idempotency,
          authorityOutcomeOverride: authority.outcome,
        });
        const latencyMs = Math.round(performance.now() - t0);
        this.trace.push({
          toolName: tool.name,
          status: "success",
          authorityOutcome: authority.outcome,
          attempt,
          latencyMs,
        });
        this.authorityOutcomes[authority.outcome] += 1;
        return output;
      } catch (err) {
        const latencyMs = Math.round(performance.now() - t0);
        if (err instanceof ToolError) {
          this.trace.push({
            toolName: tool.name,
            status: statusFromErrorClass(err.errorClass),
            errorClass: err.errorClass,
            authorityOutcome: authority.outcome,
            attempt,
            latencyMs,
          });
          this.authorityOutcomes[authority.outcome] += 1;
          lastError = err;
          const canRetry =
            isRetryable(err, retry.retryableClasses) && attempt < retry.maxAttempts;
          if (!canRetry) {
            this.toolFailures += 1;
            throw err;
          }
          try {
            await sleep(
              backoffMs(attempt, retry.initialBackoffMs, retry.maxBackoffMs),
              signal,
            );
          } catch (sleepErr) {
            if (sleepErr instanceof AbortError) {
              this.toolFailures += 1;
              throw new ToolError("aborted", "Run aborted during retry backoff", {
                cause: sleepErr,
                context: { tool: tool.name },
              });
            }
            throw sleepErr;
          }
          continue;
        }
        // Non-ToolError surfaced from executeTool: should be rare since
        // F1's executor wraps everything. Treat as internal.
        this.trace.push({
          toolName: tool.name,
          status: "error",
          errorClass: "internal_error",
          authorityOutcome: authority.outcome,
          attempt,
          latencyMs,
        });
        this.authorityOutcomes[authority.outcome] += 1;
        this.toolFailures += 1;
        throw new ToolError("internal_error", "Unexpected error from executeTool", {
          cause: err,
          context: { tool: tool.name },
        });
      }
    }
    this.toolFailures += 1;
    throw lastError ?? new ToolError("internal_error", "Exhausted retries", {
      context: { tool: tool.name },
    });
  }

  /** End the run and produce its summary. Safe to call multiple times. */
  end(): RunSummary {
    if (!this.endedAt) this.endedAt = new Date();
    return this.summary();
  }

  summary(): RunSummary {
    const endedAt = this.endedAt ?? null;
    return {
      runId: this.runId,
      invokedByAgent: this.invokedByAgent,
      accountId: this.accountId,
      startedAt: this.startedAt.toISOString(),
      endedAt: endedAt ? endedAt.toISOString() : undefined,
      durationMs: endedAt
        ? endedAt.getTime() - this.startedAt.getTime()
        : undefined,
      toolCalls: this.trace.length,
      toolFailures: this.toolFailures,
      authorityOutcomes: { ...this.authorityOutcomes },
      trace: [...this.trace],
    };
  }

  private resolveCtx(): ResolveAuthorityCtx {
    return {
      accountId: this.accountId,
      userId: this.userId,
      invokedByAgent: this.invokedByAgent,
      threadId: this.threadId,
      metadata: this.options.metadataDefaults,
    };
  }
}

/** Create a new run. */
export function startAgentRun(options: RunOptions): AgentRun {
  if (!options.accountId) throw new Error("[runtime] accountId is required");
  if (!options.invokedByAgent) throw new Error("[runtime] invokedByAgent is required");
  return new AgentRun(options);
}

// ============================================================
// Helpers
// ============================================================

function statusFromErrorClass(c: ToolError["errorClass"]): TraceEntry["status"] {
  switch (c) {
    case "denied_by_authority":
    case "unavailable":
      return "denied";
    case "queued_for_approval":
      return "queued_for_approval";
    default:
      return "error";
  }
}

/**
 * Merge an external AbortSignal with an optional timeout into a single
 * signal that aborts on whichever fires first.
 */
function mergeSignals(
  runSignal: AbortSignal | undefined,
  callSignal: AbortSignal | undefined,
  timeoutMs: number | null,
): AbortSignal | undefined {
  if (!runSignal && !callSignal && !timeoutMs) return undefined;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (runSignal) {
    if (runSignal.aborted) ctrl.abort();
    else runSignal.addEventListener("abort", onAbort, { once: true });
  }
  if (callSignal) {
    if (callSignal.aborted) ctrl.abort();
    else callSignal.addEventListener("abort", onAbort, { once: true });
  }
  if (timeoutMs && timeoutMs > 0) {
    setTimeout(() => ctrl.abort(), timeoutMs).unref?.();
  }
  return ctrl.signal;
}

// Re-export
export type { AuthorityResolution };
