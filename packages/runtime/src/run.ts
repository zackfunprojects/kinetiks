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
  getEscalationHandler,
  getLedgerAppender,
  getPerActionApprovalHandler,
  type AuthorityResolution,
  type PerActionApprovalDecision,
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
    // For a pre-approved execution — an action the customer already
    // approved is being carried out — authority is NOT re-resolved.
    // Re-resolving would re-trigger escalation/gating and loop forever;
    // the approval-execution path is the only caller allowed to set
    // `preApproved`.
    let authority: AuthorityResolution;
    let approvalIdForExec: string | null = options.approvalId ?? null;

    if (options.preApproved) {
      authority = options.grantId
        ? { outcome: "grant_covers", grantId: options.grantId }
        : { outcome: "auto_threshold", grantId: null };
    } else {
      // Phase 4: thread per-call scope + action_input into the resolver
      // context so the §2.9 flow can pick the narrowest grant and
      // evaluate constraints / triggers against the actual payload.
      authority = await getAuthorityResolver()(
        tool,
        this.resolveCtx(input, options),
      );

      // ── Phase 4: handle escalated / denied outcomes BEFORE execution ──
      // These outcomes mean the action MUST NOT execute even if it would
      // otherwise succeed. The resolver has already established that a
      // covering grant exists but a check (constraint, rate limit, spend
      // envelope, or escalation trigger) failed.
      if (authority.outcome === "escalated") {
        // handleEscalation MUST surface its own failures — without the
        // approval row inserted, the customer never sees the escalation
        // and the action is silently lost. Configuration errors and
        // Supabase insert errors propagate up so the caller observes a
        // hard failure rather than a silent drop.
        const approvalId = await this.handleEscalation(tool, input, authority);
        this.trace.push({
          toolName: tool.name,
          status: "queued_for_approval",
          errorClass: "queued_for_approval",
          authorityOutcome: "escalated",
          attempt: 0,
          latencyMs: 0,
        });
        this.authorityOutcomes.escalated += 1;
        throw new ToolError(
          "queued_for_approval",
          `Action escalated to per-action approval (${authority.reason?.code ?? "trigger_fired"})`,
          {
            context: compactContext({
              tool: tool.name,
              grant_id: authority.grantId,
              approval_id: approvalId,
              reason_code: authority.reason?.code ?? "trigger_fired",
              trigger_type: authority.reason?.trigger_type,
            }),
          },
        );
      }
      if (authority.outcome === "denied") {
        // For denied: the action is rejected regardless of the ledger
        // write outcome. A ledger failure here is recorded but does not
        // stop us from throwing denied_by_authority — the user-facing
        // outcome is the same either way.
        try {
          await this.recordDenial(tool, authority);
        } catch (ledgerErr) {
          // eslint-disable-next-line no-console
          console.error(
            `[runtime/run] Ledger authority_action_escalated (denied) append failed for tool=${tool.name} grant=${authority.grantId ?? "none"}: ${(ledgerErr as Error)?.message ?? "unknown"}`,
          );
        }
        this.trace.push({
          toolName: tool.name,
          status: "denied",
          errorClass: "denied_by_authority",
          authorityOutcome: "denied",
          attempt: 0,
          latencyMs: 0,
        });
        this.authorityOutcomes.denied += 1;
        throw new ToolError(
          "denied_by_authority",
          `Action denied by authority resolution (${authority.reason?.code ?? "policy"})`,
          {
            context: compactContext({
              tool: tool.name,
              grant_id: authority.grantId,
              reason_code: authority.reason?.code,
            }),
          },
        );
      }

      // ── Remediation (Finding 1.2): consequential action with NO grant ──
      // `auto_threshold` / `fallback` mean the §2.9 resolver found no
      // grant covering this consequential action. It must NOT execute
      // without an approval record — route it through the per-action
      // approval flow. If the flow auto-approves (the tool's confidence
      // bar is met) we execute, pinning the approval id; otherwise we
      // throw `queued_for_approval` and the action waits for the
      // customer. Non-consequential reads never reach this branch.
      if (
        tool.isConsequential &&
        tool.actionClass &&
        (authority.outcome === "auto_threshold" ||
          authority.outcome === "fallback")
      ) {
        const decision = await this.handlePerActionApproval(tool, input);
        if (decision.decision === "queued") {
          this.trace.push({
            toolName: tool.name,
            status: "queued_for_approval",
            errorClass: "queued_for_approval",
            authorityOutcome: authority.outcome,
            attempt: 0,
            latencyMs: 0,
          });
          this.authorityOutcomes.queued += 1;
          throw new ToolError(
            "queued_for_approval",
            "Action queued for your approval",
            {
              context: compactContext({
                tool: tool.name,
                approval_id: decision.approval_id,
              }),
            },
          );
        }
        approvalIdForExec = decision.approval_id;
      }
    }

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
          approvalId: approvalIdForExec,
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
        // Phase 4: emit `authority_action_taken` to the Learning Ledger
        // when the action executed under an active grant. Per addendum
        // §2.9 this entry is the customer-visible audit trail; the
        // operational `tool_calls` row covers the operational log. PII
        // rules per CLAUDE.md: counts, ids, action class strings only.
        //
        // The external mutation already succeeded; a ledger write
        // failure here must NOT propagate back as an error response.
        // We log the failure and continue — the operational `tool_calls`
        // row + the agent's success path keep the system observable.
        // Audit drift here is a soft failure to escalate to ops, not a
        // hard fault on the customer-visible action.
        if (
          authority.outcome === "grant_covers" &&
          authority.grantId &&
          tool.actionClass
        ) {
          try {
            await this.recordActionTaken(tool, authority, input, output);
          } catch (ledgerErr) {
            // eslint-disable-next-line no-console
            console.error(
              `[runtime/run] Ledger authority_action_taken append failed for tool=${tool.name} grant=${authority.grantId} action_class=${tool.actionClass}: ${(ledgerErr as Error)?.message ?? "unknown"}`,
            );
          }
        }
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

  private resolveCtx(
    input?: unknown,
    options?: InvokeToolOptions,
  ): ResolveAuthorityCtx {
    return {
      accountId: this.accountId,
      userId: this.userId,
      invokedByAgent: this.invokedByAgent,
      threadId: this.threadId,
      actionInput: input,
      scopeType: options?.scopeType,
      scopeId: options?.scopeId,
      budgetCategoryId: options?.budgetCategoryId,
      metadata: this.options.metadataDefaults,
    };
  }

  /**
   * Remediation (Finding 1.2): route a consequential action that has no
   * covering grant through the per-action approval flow. Returns the
   * decision; the caller executes on `auto_approved` and throws
   * `queued_for_approval` otherwise.
   *
   * Fails CLOSED: if the handler is not configured we throw
   * `configuration_error` rather than executing — a consequential action
   * must never run without an approval record. This is the opposite of
   * the pre-remediation behavior, where the absence of a handler let the
   * action execute unchecked.
   */
  private async handlePerActionApproval<TIn, TOut>(
    tool: AgentTool<TIn, TOut>,
    input: TIn,
  ): Promise<PerActionApprovalDecision> {
    const handler = getPerActionApprovalHandler();
    if (!handler) {
      throw new ToolError(
        "configuration_error",
        "Per-action approval handler is not configured; refusing to execute a consequential action without an approval",
        { context: compactContext({ tool: tool.name }) },
      );
    }
    if (!tool.actionClass) {
      throw new ToolError(
        "internal_error",
        "handlePerActionApproval called for a tool without an action_class",
        { context: { tool: tool.name } },
      );
    }
    return handler.request({
      account_id: this.accountId,
      invoked_by_agent: this.invokedByAgent,
      tool_name: tool.name,
      action_class: tool.actionClass,
      action_input: input,
      auto_approve_threshold: tool.autoApproveThreshold ?? null,
    });
  }

  /**
   * Phase 4: enqueue an escalation when the resolver returned
   * `escalated`. Returns the approval_id so the caller can echo it in
   * the thrown `queued_for_approval` ToolError.
   *
   * Adapters must be configured at boot (apps/id/src/lib/runtime/runtime-boot.ts).
   * If either adapter is missing the escalation cannot be enqueued —
   * we throw a configuration_error so the action does NOT proceed
   * (safer than silent fallthrough to executeTool).
   */
  private async handleEscalation<TIn, TOut>(
    tool: AgentTool<TIn, TOut>,
    input: TIn,
    authority: AuthorityResolution,
  ): Promise<string> {
    const handler = getEscalationHandler();
    if (!handler) {
      throw new ToolError(
        "configuration_error",
        "Authority escalation handler is not configured; cannot enqueue approval for escalated action",
        { context: compactContext({ tool: tool.name, grant_id: authority.grantId }) },
      );
    }
    if (!tool.actionClass || !authority.grantId) {
      throw new ToolError(
        "internal_error",
        "Authority resolver returned 'escalated' for a tool without an action_class or grant_id",
        { context: { tool: tool.name } },
      );
    }
    const { approval_id } = await handler.enqueue({
      account_id: this.accountId,
      invoked_by_agent: this.invokedByAgent,
      tool_name: tool.name,
      action_class: tool.actionClass,
      action_input: input,
      grant_id: authority.grantId,
      reason: authority.reason ?? {
        code: "constraint_failed",
        detail: "escalated without a reason payload",
      },
    });

    const appender = getLedgerAppender();
    if (appender) {
      await appender.append({
        account_id: this.accountId,
        event_type: "authority_action_escalated",
        grant_id: authority.grantId,
        source_app: "kinetiks_id",
        source_operator: this.invokedByAgent,
        detail: {
          grant_id: authority.grantId,
          action_class: tool.actionClass,
          tool_name: tool.name,
          reason_code: authority.reason?.code ?? "trigger_fired",
          trigger_type: authority.reason?.trigger_type,
          trigger_index: authority.reason?.trigger_index,
          detail: authority.reason?.detail ?? "",
          approval_id,
        },
      });
    }
    return approval_id;
  }

  /**
   * Phase 4: append a `authority_action_escalated` Ledger entry with
   * `reason_code` set for the denial. No approval is enqueued — the
   * action is hard-denied (e.g. spend-bearing action class with no
   * spending envelope on the grant). The customer sees the denial via
   * the trace summary; UI may surface it in the Authority tab.
   */
  private async recordDenial<TIn, TOut>(
    tool: AgentTool<TIn, TOut>,
    authority: AuthorityResolution,
  ): Promise<void> {
    const appender = getLedgerAppender();
    if (!appender || !tool.actionClass) return;
    await appender.append({
      account_id: this.accountId,
      event_type: "authority_action_escalated",
      grant_id: authority.grantId ?? "00000000-0000-0000-0000-000000000000",
      source_app: "kinetiks_id",
      source_operator: this.invokedByAgent,
      detail: {
        grant_id: authority.grantId,
        action_class: tool.actionClass,
        tool_name: tool.name,
        reason_code: authority.reason?.code ?? "missing_budget",
        detail: `denied: ${authority.reason?.detail ?? "policy"}`,
        approval_id: null,
        denied: true,
      },
    });
  }

  /**
   * Phase 4: append `authority_action_taken` to the Learning Ledger
   * after a `grant_covers` execution succeeds. The detail summary is
   * PII-safe: action class string, tool name, input field counts +
   * lengths, and an optional output ref if the tool returned one.
   *
   * The customer-visible audit trail uses this entry, NOT the
   * operational `tool_calls` row.
   */
  private async recordActionTaken<TIn, TOut>(
    tool: AgentTool<TIn, TOut>,
    authority: AuthorityResolution,
    input: TIn,
    output: TOut,
  ): Promise<void> {
    const appender = getLedgerAppender();
    if (!appender || !tool.actionClass || !authority.grantId) return;
    await appender.append({
      account_id: this.accountId,
      event_type: "authority_action_taken",
      grant_id: authority.grantId,
      source_app: "kinetiks_id",
      source_operator: this.invokedByAgent,
      detail: {
        grant_id: authority.grantId,
        action_class: tool.actionClass,
        tool_name: tool.name,
        action_input_summary: summarizeForLedger(input),
        outcome_ref: extractOutcomeRef(output),
      },
    });
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

/**
 * Strip null and undefined values from a context object so it satisfies
 * ToolError's `Record<string, string | number | boolean | string[]>`
 * shape without manual narrowing at every callsite.
 */
function compactContext(
  obj: Record<string, string | number | boolean | string[] | null | undefined>,
): Record<string, string | number | boolean | string[]> {
  const out: Record<string, string | number | boolean | string[]> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

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
 * PII-safe summarization of a tool input for the Learning Ledger
 * `authority_action_taken` entry. Per CLAUDE.md, never dump full
 * payloads, recipient emails, or message bodies into Ledger detail —
 * counts, lengths, and one-way fingerprints only.
 *
 * Convention:
 *   - Numbers and booleans are passed through verbatim.
 *   - Strings emit `${k}_hash` (sha256 truncated to 16 hex chars) and
 *     `${k}_length`. The original string content is never written; the
 *     hash is sufficient for cross-action equivalence checks without
 *     leaking the content into the audit row.
 *   - Arrays emit `${k}_count` only (no per-item enumeration).
 *   - Nested objects emit `${k}_key_count` only (no key names — a
 *     key name like `internal_password_hint` would itself leak intent).
 *
 * The hash is non-reversible. Customers reading the Ledger see action
 * cadence, structural fingerprints, and counts — never original
 * content.
 */
function summarizeForLedger(
  input: unknown,
): Record<string, string | number | boolean | string[]> {
  if (typeof input !== "object" || input === null) return {};
  const out: Record<string, string | number | boolean | string[]> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "boolean" || typeof v === "number") {
      out[k] = v;
      continue;
    }
    if (typeof v === "string") {
      out[`${k}_length`] = v.length;
      out[`${k}_hash`] = shortSha256(v);
      continue;
    }
    if (Array.isArray(v)) {
      out[`${k}_count`] = v.length;
      continue;
    }
    if (typeof v === "object") {
      out[`${k}_key_count`] = Object.keys(
        v as Record<string, unknown>,
      ).length;
      continue;
    }
  }
  return out;
}

/**
 * sha256(value) → first 16 lowercase hex chars. Truncating preserves
 * collision-equivalent identity for our use case (cross-action input
 * fingerprinting) while keeping the audit row small. `node:crypto` is
 * the only crypto provider; this module is server-only so it is always
 * available.
 */
function shortSha256(value: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("node:crypto") as typeof import("node:crypto");
  return crypto.createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

/**
 * Best-effort extraction of a stable outcome reference (event_id,
 * draft_id, message_ts, etc.) from a tool's output. Returns undefined
 * if none of the conventional keys are present. Used by the Ledger
 * `authority_action_taken` detail; falling back to no reference is
 * acceptable (the trace is still attributable via grant_id + tool_calls.id).
 */
function extractOutcomeRef(output: unknown): string | undefined {
  if (typeof output !== "object" || output === null) return undefined;
  const obj = output as Record<string, unknown>;
  const candidates = [
    "event_id",
    "draft_id",
    "message_ts",
    "message_id",
    "id",
  ];
  for (const k of candidates) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
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
