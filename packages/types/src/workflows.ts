/**
 * Workflow primitive types per the Kinetiks Contract Addendum §3.
 *
 * Phase 3 ships the minimum shape the Operator Workflows extension
 * needs: a task names what to dispatch and how to address it, and the
 * runtime distinguishes cross-app dispatch (Synapse Routing Event)
 * from internal dispatch (in-process Operator Registry lookup).
 *
 * Branching, parallel-then-merge, approval checkpoints, persistence,
 * pause/resume, and Programs as a parent container are explicitly NOT
 * here — they layer in additively when Implosion (or another consumer)
 * needs them. See `docs/build-phases/upcoming/phase-3-operator-workflows-platform.md`.
 */

/**
 * A single addressable unit of work in a Workflow. Per the Kinetiks
 * Contract Addendum §3.2.
 *
 * `target_type` toggles the dispatch path:
 *   - `cross_app`: insert a row in `kinetiks_routing_events` for the
 *     target app's Synapse to pick up. Output of this task is
 *     `{ routed: true, target_app }` — there is no in-line response.
 *   - `internal_operator`: look up the operator in the host app's
 *     Operator Registry, validate input/output against its descriptor
 *     schemas, and invoke it in-process.
 *
 * `target_app` matches the canonical app key used everywhere (e.g.
 * `kinetiks_id`, `harvest`, `dark_madder`), NOT the 2-letter table
 * prefix. It is the same value as `source_app` on a descriptor.
 *
 * `target_capability` is the operator key (for internal) or a
 * cross-app capability name (for cross_app). The dispatcher does not
 * interpret it beyond that distinction.
 */
export interface WorkflowTask<TInput = unknown> {
  /** Stable identifier within the WorkflowDefinition. Used as the key for upstream output propagation. */
  readonly key: string;
  /** Human-readable label. Logged in Ledger entries; not interpreted by dispatch. */
  readonly label: string;
  /** Cross-app via Synapse Routing Event, or internal via Operator Registry. */
  readonly target_type: "cross_app" | "internal_operator";
  /**
   * For `cross_app`: app capability name (cross-app contract; not validated by the dispatcher).
   * For `internal_operator`: the operator's `key` within `target_app`.
   */
  readonly target_capability: string;
  /** Canonical app key. Matches descriptor `source_app`. */
  readonly target_app: string;
  /**
   * Either a static input or a derivation function. The derivation
   * receives prior task outputs (keyed by upstream task key) and the
   * dispatch context. Output of the function MUST match TInput.
   */
  readonly input:
    | TInput
    | ((
        upstream: Record<string, unknown>,
        ctx: WorkflowDispatchContext,
      ) => TInput);
  /**
   * Optional plain-language note that rides on cross_app routing
   * events (`kinetiks_routing_events.relevance_note`). Ignored for
   * internal_operator dispatch.
   */
  readonly relevance_note?: string;
}

/**
 * A Workflow definition is a typed code constant in Phase 3.
 *
 * The `key` is namespaced by app (e.g. `kinetiks_id.archivist_maintenance`)
 * for the same reason pattern types and action classes are: a global
 * registry should never collide across apps, and the prefix makes the
 * owner visible at a glance.
 */
export interface WorkflowDefinition {
  /** App-namespaced key. e.g. `kinetiks_id.archivist_maintenance`. */
  readonly key: string;
  /** Human-readable description; surfaces in Ledger and logs. */
  readonly description: string;
  /** Sequential task list. Phase 3 executes them in declared order. */
  readonly tasks: ReadonlyArray<WorkflowTask>;
}

/**
 * Context passed through every task dispatch in a Workflow run.
 *
 * `correlation_id` threads through every Ledger entry written by the
 * dispatcher, so a single SQL query reconstructs the full run.
 *
 * `invoked_by` is who started this run (operator key like
 * `kinetiks_id.archivist` or a cron tag like `cron:archivist-maintenance`).
 */
export interface WorkflowDispatchContext {
  /** null for account-agnostic workflows (cron summaries, etc.). */
  readonly account_id: string | null;
  /** UUID threaded through every Ledger write for the run. */
  readonly correlation_id: string;
  /** Operator key or `cron:<name>`. Recorded in Ledger `source_operator`. */
  readonly invoked_by: string;
  /** v1 always null; reserved for v2 team semantics per CLAUDE.md. */
  readonly team_scope_id?: string | null;
  /**
   * Open-ended bag for caller-supplied data that needs to thread into
   * task inputs (e.g. the account batch the cron is processing).
   * NEVER store PII or full payloads here — the value is read by
   * `input` derivation functions and may surface in Ledger detail.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Result of a single task dispatch. Returned by `dispatchWorkflowTask`
 * and included in the WorkflowRunSummary.
 */
export interface WorkflowTaskResult {
  readonly task_key: string;
  readonly status: "completed" | "failed";
  /** Validated output (internal_operator) or { routed: true, ... } (cross_app). */
  readonly output?: unknown;
  /** Present when status === "failed". Class is the error class string. */
  readonly error?: { class: string; message: string };
  readonly latency_ms: number;
}

/**
 * Summary of a full Workflow run. The dispatcher's default policy is
 * to stop on the first failed task; remaining task results are
 * therefore absent from `tasks` rather than marked as cancelled.
 */
export interface WorkflowRunSummary {
  readonly workflow_key: string;
  readonly correlation_id: string;
  readonly tasks: ReadonlyArray<WorkflowTaskResult>;
  readonly started_at: string;
  readonly ended_at: string;
  /** True iff every task in the definition completed successfully. */
  readonly ok: boolean;
}
