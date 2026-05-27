/**
 * Workflow dispatcher — single entry point for `dispatchWorkflowTask`
 * and `runWorkflow`. Per the Kinetiks Contract Addendum §3.2.
 *
 * Two branches, one type:
 *  - `target_type: 'cross_app'` → write a row to `kinetiks_routing_events`
 *    via the host-injected `insertRoutingEvent`. Output is the marker
 *    `{ routed: true, target_app }`; the cross-app side handles the
 *    actual work via its Synapse `handleRoutingEvent`.
 *  - `target_type: 'internal_operator'` → look up the operator in the
 *    in-process Operator Registry (Phase 3, populated at boot by
 *    `apps/id/src/lib/operators/registry-boot.ts`), validate input
 *    against the descriptor's `inputs_schema`, invoke the host-resolved
 *    executor, validate output against `outputs_schema`.
 *
 * Per-task Ledger writes:
 *  - `workflow_task_dispatched` BEFORE the work runs (so we see the
 *    intent even if the work hangs or crashes the process).
 *  - `workflow_task_completed` or `workflow_task_failed` AFTER. Only
 *    one of these per task per run.
 *
 * Default policy: stop on first task failure. The remaining tasks are
 * absent from the run summary's `tasks[]` rather than marked as
 * cancelled. If/when consumers need different policies (continue on
 * error, retry, isolated branches), add an option here.
 *
 * Ledger write failures DO NOT halt the workflow. The host's
 * `writeLedger` is responsible for its own error policy; this
 * dispatcher awaits the promise and proceeds with the work regardless
 * of resolution. (The task's success/failure status is what determines
 * workflow control flow, not the Ledger entry.)
 */

import type {
  WorkflowDefinition,
  WorkflowDispatchContext,
  WorkflowRunSummary,
  WorkflowTask,
  WorkflowTaskResult,
} from "@kinetiks/types";
import { ToolError, assertOperator } from "@kinetiks/tools";

// ============================================================
// Public types
// ============================================================

/**
 * In-process Operator implementation. The host (apps/id) maintains a
 * map from `(app, operator_key)` to one of these functions.
 *
 * Returned values are validated against the operator's
 * `outputs_schema`. To stay PII-safe in the Ledger, executors should
 * return only the summary-grade fields they want logged; full payloads
 * should remain in their own tables / files / streams.
 */
export interface OperatorExecutor {
  (input: unknown, ctx: OperatorExecuteContext): Promise<unknown>;
}

export interface OperatorExecuteContext extends WorkflowDispatchContext {
  /** Operator the executor is implementing. Matches `target_capability`. */
  readonly operator_key: string;
  /** Task that triggered this invocation. */
  readonly task_key: string;
}

/** Host-supplied lookup. Returns undefined if the (app, key) pair is not wired. */
export interface OperatorExecutorResolver {
  (app: string, operator_key: string): OperatorExecutor | undefined;
}

/**
 * Row shape written to `kinetiks_routing_events` for cross-app
 * dispatch. The dispatcher constructs this; the host's
 * `insertRoutingEvent` is responsible for the DB write.
 */
export interface RoutingEventInsert {
  readonly account_id: string | null;
  readonly target_app: string;
  readonly payload: {
    readonly workflow_key: string;
    readonly task_key: string;
    readonly capability: string;
    readonly input: unknown;
  };
  readonly relevance_note: string | null;
}

/**
 * Ledger entry the dispatcher emits. The host's `writeLedger` adapts
 * this into a `kinetiks_ledger` row (which carries additional fields
 * like `source_app`, `target_layer`, `created_at`).
 *
 * `event_type` matches the typed `LedgerEventDetailMap` keys added in
 * Phase 3 (`@kinetiks/types/src/billing.ts`); `detail` matches the
 * shape declared for that key.
 */
export interface LedgerWrite {
  readonly event_type:
    | "workflow_task_dispatched"
    | "workflow_task_completed"
    | "workflow_task_failed";
  readonly account_id: string | null;
  readonly source_operator: string;
  readonly detail: Record<string, unknown>;
}

/**
 * Host-injected dependencies. Tests pass in-memory implementations;
 * production wires Supabase-backed implementations in the host app.
 */
export interface DispatchDeps {
  readonly resolveOperator: OperatorExecutorResolver;
  readonly insertRoutingEvent: (row: RoutingEventInsert) => Promise<void>;
  readonly writeLedger: (entry: LedgerWrite) => Promise<void>;
}

// ============================================================
// Dispatch
// ============================================================

/**
 * Dispatch a single Workflow task. Used by `runWorkflow` and exported
 * so callers can drive task-at-a-time execution (tests, ad-hoc REPL
 * runs).
 *
 * On success, returns a `WorkflowTaskResult` with `status: "completed"`.
 * On failure, returns `status: "failed"` AND throws the underlying
 * error after writing the failed Ledger entry. Callers that want
 * continue-on-error semantics should wrap the call in try/catch.
 *
 * `upstream` is a map of `task_key → output` from previously-completed
 * tasks in the same run. The dispatcher itself only forwards it to
 * the `task.input` function (if `input` is a function); it does not
 * read or mutate `upstream`.
 */
export async function dispatchWorkflowTask<TInput = unknown>(
  task: WorkflowTask<TInput>,
  upstream: Record<string, unknown>,
  ctx: WorkflowDispatchContext,
  deps: DispatchDeps,
): Promise<WorkflowTaskResult> {
  const started = performance.now();

  // 1. Dispatched Ledger entry (intent) — fire-and-await; never blocks flow on Ledger failure.
  await safeLedger(deps, {
    event_type: "workflow_task_dispatched",
    account_id: ctx.account_id,
    source_operator: ctx.invoked_by,
    detail: {
      workflow_key: workflowKeyForCtx(ctx),
      task_key: task.key,
      target_type: task.target_type,
      target_app: task.target_app,
      target_capability: task.target_capability,
      correlation_id: ctx.correlation_id,
    },
  });

  try {
    // 2. Resolve input INSIDE the failure-path try so a throwing input
    // derivation still emits workflow_task_failed (cross_app passes
    // through opaquely; internal_operator schema-validates downstream).
    const resolvedInput =
      typeof task.input === "function"
        ? (task.input as (
            u: Record<string, unknown>,
            c: WorkflowDispatchContext,
          ) => TInput)(upstream, ctx)
        : task.input;

    let output: unknown;

    if (task.target_type === "cross_app") {
      output = await dispatchCrossApp(task, resolvedInput, ctx, deps);
    } else {
      output = await dispatchInternal(task, resolvedInput, ctx, deps);
    }

    const latency_ms = Math.round(performance.now() - started);

    await safeLedger(deps, {
      event_type: "workflow_task_completed",
      account_id: ctx.account_id,
      source_operator: ctx.invoked_by,
      detail: {
        workflow_key: workflowKeyForCtx(ctx),
        task_key: task.key,
        target_type: task.target_type,
        target_app: task.target_app,
        target_capability: task.target_capability,
        correlation_id: ctx.correlation_id,
        latency_ms,
        // The executor is responsible for keeping the output summary
        // small + PII-safe. The dispatcher does not inspect or trim.
        output_summary: summarize(output),
      },
    });

    return {
      task_key: task.key,
      status: "completed",
      output,
      latency_ms,
    };
  } catch (err) {
    const latency_ms = Math.round(performance.now() - started);
    const { error_class, error_message } = classifyError(err);

    await safeLedger(deps, {
      event_type: "workflow_task_failed",
      account_id: ctx.account_id,
      source_operator: ctx.invoked_by,
      detail: {
        workflow_key: workflowKeyForCtx(ctx),
        task_key: task.key,
        target_type: task.target_type,
        target_app: task.target_app,
        target_capability: task.target_capability,
        correlation_id: ctx.correlation_id,
        latency_ms,
        error_class,
        error_message,
      },
    });

    throw err;
  }
}

/**
 * Run a Workflow definition end-to-end. Iterates tasks sequentially;
 * propagates each task's output into the upstream map keyed by
 * `task.key`. Stops on first failure (the failed task IS included in
 * the summary; subsequent tasks are not dispatched).
 *
 * Returns a summary; never throws. (Individual task failures are
 * captured in the summary's `tasks[]` and reflected in `ok: false`.)
 */
export async function runWorkflow(
  workflow: WorkflowDefinition,
  ctx: WorkflowDispatchContext,
  deps: DispatchDeps,
): Promise<WorkflowRunSummary> {
  const started_at = new Date().toISOString();
  const upstream: Record<string, unknown> = {};
  const results: WorkflowTaskResult[] = [];

  // Tag the context with the workflow_key so dispatched-task Ledger
  // entries can include it without each task carrying a redundant ref.
  const enrichedCtx: WorkflowDispatchContext = {
    ...ctx,
    metadata: { ...(ctx.metadata ?? {}), __workflow_key: workflow.key },
  };

  let ok = true;
  for (const task of workflow.tasks) {
    try {
      const result = await dispatchWorkflowTask(task, upstream, enrichedCtx, deps);
      results.push(result);
      upstream[task.key] = result.output;
    } catch (err) {
      // dispatchWorkflowTask has already written the failed Ledger entry
      // and re-thrown. Capture the failure in the summary.
      const { error_class, error_message } = classifyError(err);
      results.push({
        task_key: task.key,
        status: "failed",
        error: { class: error_class, message: error_message },
        latency_ms: 0,
      });
      ok = false;
      break;
    }
  }

  return {
    workflow_key: workflow.key,
    correlation_id: ctx.correlation_id,
    tasks: results,
    started_at,
    ended_at: new Date().toISOString(),
    ok,
  };
}

// ============================================================
// Branch impls
// ============================================================

async function dispatchInternal<TInput>(
  task: WorkflowTask<TInput>,
  input: TInput,
  ctx: WorkflowDispatchContext,
  deps: DispatchDeps,
): Promise<unknown> {
  // assertOperator throws ToolError("configuration_error") if the
  // (app, key) pair is not registered. We let it surface; the dispatch
  // catch path writes the failed Ledger entry.
  const descriptor = assertOperator(task.target_app, task.target_capability);

  // Input validation against the descriptor's inputs_schema. Failure
  // is `invalid_input` — the workflow is wired wrong, not the operator.
  const parsedInput = descriptor.inputs_schema.safeParse(input);
  if (!parsedInput.success) {
    throw new ToolError(
      "invalid_input",
      `Input failed inputs_schema for operator "${task.target_app}.${task.target_capability}": ${parsedInput.error.message}`,
      {
        cause: parsedInput.error,
        context: {
          workflow_task_key: task.key,
          operator: `${task.target_app}.${task.target_capability}`,
        },
      },
    );
  }

  const executor = deps.resolveOperator(task.target_app, task.target_capability);
  if (!executor) {
    // Registered in the descriptor registry but not wired to an
    // executor function. This is a host configuration bug.
    throw new ToolError(
      "configuration_error",
      `No executor wired for operator "${task.target_app}.${task.target_capability}" (descriptor is registered but resolveOperator returned undefined)`,
      {
        context: {
          workflow_task_key: task.key,
          operator: `${task.target_app}.${task.target_capability}`,
        },
      },
    );
  }

  const opCtx: OperatorExecuteContext = {
    ...ctx,
    operator_key: task.target_capability,
    task_key: task.key,
  };

  const output = await executor(parsedInput.data, opCtx);

  // Output validation. Failure is `invalid_output` — the operator
  // misbehaved (returned a shape its own descriptor declared it would not).
  const parsedOutput = descriptor.outputs_schema.safeParse(output);
  if (!parsedOutput.success) {
    throw new ToolError(
      "invalid_output",
      `Output failed outputs_schema for operator "${task.target_app}.${task.target_capability}": ${parsedOutput.error.message}`,
      {
        cause: parsedOutput.error,
        context: {
          workflow_task_key: task.key,
          operator: `${task.target_app}.${task.target_capability}`,
        },
      },
    );
  }

  return parsedOutput.data;
}

async function dispatchCrossApp<TInput>(
  task: WorkflowTask<TInput>,
  input: TInput,
  ctx: WorkflowDispatchContext,
  deps: DispatchDeps,
): Promise<{ routed: true; target_app: string }> {
  await deps.insertRoutingEvent({
    account_id: ctx.account_id,
    target_app: task.target_app,
    payload: {
      workflow_key: workflowKeyForCtx(ctx),
      task_key: task.key,
      capability: task.target_capability,
      input,
    },
    relevance_note: task.relevance_note ?? null,
  });
  return { routed: true, target_app: task.target_app };
}

// ============================================================
// Helpers
// ============================================================

/**
 * Best-effort Ledger write. The host's writeLedger may throw on DB
 * errors; we don't want to halt the workflow because of an
 * observability hiccup. Surface to console.error so the failure is
 * noticed but unconditionally continue.
 *
 * Production hosts SHOULD also pipe their writeLedger errors to
 * Sentry; this safe wrapper only protects the dispatch flow itself.
 */
async function safeLedger(deps: DispatchDeps, entry: LedgerWrite): Promise<void> {
  try {
    await deps.writeLedger(entry);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[workflow-dispatch] writeLedger failed for event_type=${entry.event_type}`,
      err,
    );
  }
}

function classifyError(err: unknown): { error_class: string; error_message: string } {
  if (err instanceof ToolError) {
    return { error_class: err.errorClass, error_message: err.message };
  }
  if (err instanceof Error) {
    return { error_class: "internal_error", error_message: err.message };
  }
  return { error_class: "internal_error", error_message: String(err) };
}

/**
 * The workflow_key lives on the WorkflowDefinition. When the
 * dispatcher is called via `dispatchWorkflowTask` directly (not
 * `runWorkflow`), the workflow_key is not available — surface
 * "ad_hoc" so Ledger entries are still well-formed.
 */
function workflowKeyForCtx(ctx: WorkflowDispatchContext): string {
  const fromMeta = ctx.metadata?.["__workflow_key"];
  return typeof fromMeta === "string" ? fromMeta : "ad_hoc";
}

/**
 * Produce a tiny, PII-safe summary of the task output for the
 * `workflow_task_completed` Ledger entry. We err on the side of
 * including very little: top-level numeric/boolean scalars, array
 * lengths, and object key counts. Raw strings are NEVER persisted —
 * even with truncation, a top-level string field could be a name,
 * email address, OAuth token fragment, or prompt text. Operators
 * that want a string surfaced in Ledger should return it in a
 * purpose-named field and the executor itself is the right layer to
 * sanitize it (per CLAUDE.md PII rules).
 *
 * String fields are recorded as a sibling `<key>_chars` length-only
 * hint so the trace still shows that the field was returned and
 * roughly how big it was.
 */
function summarize(output: unknown): Record<string, unknown> {
  if (output === null || output === undefined) return {};
  if (typeof output !== "object") return { value_type: typeof output };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
    if (v === null) {
      out[k] = null;
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else if (typeof v === "string") {
      // PII-safe: never persist the raw string in Ledger detail.
      // Surface a length hint so the operator's contract is visible
      // without leaking the value.
      out[`${k}_chars`] = v.length;
    } else if (Array.isArray(v)) {
      out[`${k}_count`] = v.length;
    } else if (typeof v === "object") {
      out[`${k}_keys`] = Object.keys(v as object).length;
    }
  }
  return out;
}
