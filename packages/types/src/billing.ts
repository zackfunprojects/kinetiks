/**
 * Billing and account management types.
 * Matches kinetiks_billing, kinetiks_app_activations, kinetiks_synapses,
 * kinetiks_imports, and kinetiks_ledger tables.
 */

import type { ContextLayer } from "./context";

// ── Billing ──

export type BillingPlan = "free" | "starter" | "pro" | "team";

export type BillingPlanStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "trialing";

export interface BillingRecord {
  id: string;
  account_id: string;
  stripe_customer_id: string | null;
  plan: BillingPlan;
  plan_status: BillingPlanStatus;
  current_period_end: string | null;
  seeds_balance: number;
  payment_method_last4: string | null;
  created_at: string;
  updated_at: string;
}

// ── App Activations ──

export type AppActivationStatus = "active" | "paused" | "deactivated";

export type KineticsAppName =
  | "dark_madder"
  | "harvest"
  | "hypothesis"
  | "litmus";

export interface AppActivation {
  id: string;
  account_id: string;
  app_name: KineticsAppName;
  status: AppActivationStatus;
  activated_at: string;
}

// ── Synapses ──

export type SynapseStatus = "active" | "error" | "inactive";

export interface SynapseRecord {
  id: string;
  account_id: string;
  app_name: string;
  app_url: string | null;
  status: string;
  read_layers: ContextLayer[];
  write_layers: ContextLayer[];
  realtime_channel: string | null;
  activated_at: string;
  created_at: string;
}

// ── Imports ──

export type ImportType =
  | "content_library"
  | "contacts"
  | "brand_assets"
  | "media_list";

export type ImportStatus = "pending" | "processing" | "complete" | "error";

export interface ImportRecord {
  id: string;
  account_id: string;
  import_type: ImportType;
  file_path: string | null;
  status: ImportStatus;
  stats: {
    total?: number;
    imported?: number;
    duplicates?: number;
    errors?: number;
  };
  target_app: string | null;
  created_at: string;
}

// ── Learning Ledger ──

import type { PatternLifecycleStatus } from "./patterns";

/**
 * Per-event detail shapes for the Learning Ledger. The map keys are
 * the LedgerEventType union; the values are the typed detail shape
 * each variant carries.
 *
 * Writers construct typed details; readers narrow on event_type to
 * access the variant-specific detail fields. The DB CHECK constraint
 * on `kinetiks_ledger.event_type` (migration 00042) mirrors the union.
 */
export interface LedgerEventDetailMap {
  // ── Cortex evaluation pipeline ────────────────────────────
  proposal_accepted: {
    proposal_id: string;
    decision: "accept" | "decline" | "flag";
    evaluated_by?: string;
    payload_summary?: string[];
  };
  proposal_declined: {
    proposal_id: string;
    decision: "accept" | "decline" | "flag";
    decline_reason?: string;
    evaluated_by?: string;
    payload_summary?: string[];
  };
  routing_sent: {
    proposal_id?: string;
    target_app: string;
    routing_event_id?: string;
  };
  user_edit: {
    layer?: string;
    field?: string;
    note?: string;
  };

  // ── Archivist ─────────────────────────────────────────────
  archivist_clean: { layer?: string; changes_made?: number };
  archivist_dedup: { duplicates_found?: number; duplicates_removed?: number };
  archivist_normalize: { changes_made?: number };
  archivist_quality_score: { score?: number };
  archivist_gap_detect: { gaps?: string[]; severity?: string };
  archivist_cron_run: {
    accounts_queued?: number;
    accounts_processed?: number;
    errors?: number;
    pattern_sweep_processed?: number;
    pattern_sweep_errors?: number;
    deferred_sweep_processed?: number;
    deferred_sweep_errors?: number;
    /** Phase 2: only present on the 00:00 UTC calibration-pass tick. */
    calibration_processed?: number;
    calibration_errors?: number;
    timestamp?: string;
  };

  // ── Other crons ───────────────────────────────────────────
  cortex_cron_run: { accounts_processed?: number; errors?: number };
  expire_cron_run: { expired?: number };

  // ── Generic ───────────────────────────────────────────────
  expiration: { entity?: string; entity_id?: string; reason?: string };
  import: { source?: string; count?: number };

  // ── Account lifecycle ─────────────────────────────────────
  account_created: { user_id?: string; codename?: string };
  app_activation: { app_name?: string; status?: string };

  // ── Approval lifecycle ────────────────────────────────────
  approval_batch_approved: { approval_ids?: string[]; count?: number };
  approval_expired: { approval_id?: string };
  approval_flagged: { approval_id?: string; reason?: string };
  approval_rejected: { approval_id?: string; reason?: string };

  // ── Marcus ────────────────────────────────────────────────
  marcus_daily_brief: { thread_id?: string; insight_count?: number };
  marcus_weekly_digest: { thread_id?: string };
  marcus_monthly_review: { thread_id?: string };
  command_executed: { command?: string; target_app?: string };

  // ── Cartographer ──────────────────────────────────────────
  cartographer_analyze: { layer?: string; field_count?: number };

  // ── Insights ──────────────────────────────────────────────
  insight_applied: { insight_id?: string };

  // ── Synapse ───────────────────────────────────────────────
  synapse_pull: { app_name?: string; layers?: string[] };

  // ── Sentinel ──────────────────────────────────────────────
  sentinel_review: { content_type?: string; verdict?: string };
  sentinel_override: { override_type?: string };

  // ── Pattern Library (Kinetiks Contract Addendum §1.9) ─────
  pattern_observed: {
    pattern_id: string;
    pattern_type: string;
    /** Outcome of the emission write per the discriminated PatternEmissionResult. */
    outcome:
      | "created_emerging"
      | "evidence_added"
      | "promoted"
      | "demoted"
      | "duplicate_ignored";
    evidence_refs: string[];
    /** Snapshot of the outcome value(s) after the write, primary metric only. */
    outcome_snapshot?: { metric: string; value: number; lift_ratio?: number | null };
    observation_count_after?: number;
    sample_size_after?: number;
    confidence_score_after?: number;
  };
  pattern_arbitrated: {
    pattern_id: string;
    pattern_type: string;
    from: PatternLifecycleStatus;
    to: PatternLifecycleStatus;
    reason: "confidence_threshold" | "time_decay" | "customer_archive" | "icp_removed";
    confidence_score?: number;
    triggered_at?: string;
  };
  pattern_user_starred: { pattern_id: string };
  pattern_user_unstarred: { pattern_id: string };
  pattern_user_suppressed: { pattern_id: string };
  pattern_user_unsuppressed: { pattern_id: string };
  pattern_user_annotated: { pattern_id: string; annotation_length: number };
  pattern_exported: {
    pattern_count: number;
    schema_version: string;
    export_type: "full" | "filtered";
  };
  pattern_imported: {
    pattern_id: string;
    pattern_type: string;
    /** SHA-256 hash of the source account_id, truncated to 16 hex chars. */
    imported_from_account_id_hash: string | null;
    original_confidence_score?: number;
    schema_version?: string;
  };
  pattern_archived: {
    pattern_id: string;
    from: PatternLifecycleStatus;
    reason: "time_decay" | "customer_archive" | "icp_removed";
  };
  // Phase 2: nightly empirical decay calibration. The Archivist
  // adjusts `effective_decay_days` within the descriptor's bounds
  // based on observed outcome variance and lifecycle history. Per the
  // Kinetiks Contract Addendum §1.6, with one acknowledged divergence:
  // calibration is per-pattern (writes back to
  // kinetiks_pattern_library.effective_decay_days) rather than via a
  // separate per-(account, pattern_type) calibration table. Each move
  // emits one of these entries; no-op decisions (no_move, skip) do
  // NOT emit.
  pattern_decay_calibrated: {
    pattern_id: string;
    pattern_type: string;
    prior_effective_decay_days: number;
    next_effective_decay_days: number;
    prior_decay_at: string;
    next_decay_at: string;
    observed_variance: number;
    observation_count: number;
    declining_transitions_in_window: number;
    decision: "extend" | "shorten";
    rationale: string;
  };

  // ── Fixture substrate (Phase 1.5) ─────────────────────────
  // Emitted by the fixture-emitter-cron substrate inside apps/id when
  // KINETIKS_FIXTURES_ENABLED=true. Every fixture-driven write to
  // kinetiks_pattern_library produces both a real `pattern_observed`
  // entry (via the normal write path) and a `fixture_emission` entry
  // (provenance marker for demo honesty). On cleanup, a single
  // `fixture_cleanup` entry records the archive-on-demand batch.
  fixture_emission: {
    pattern_type: string;
    pattern_id: string | null;
    /** The arbitration outcome returned by /api/synapse/patterns. */
    outcome: string;
    outcome_metric: string;
    outcome_value: number;
    sample_size: number;
    is_fixture: true;
  };
  fixture_cleanup: {
    archived_count: number;
    is_fixture: true;
  };

  // ── Phase 3: Operator Workflows ────────────────────────────
  // Emitted by the workflow dispatcher in @kinetiks/runtime. Three
  // events per task — one on dispatch and one on outcome. The
  // correlation_id threads through all entries in a single Workflow
  // run, so a SQL filter on detail->>'correlation_id' reconstructs
  // the full trace. PII rules apply: detail carries counts, ids, and
  // error classes only — never full task input/output payloads or
  // prompt text.
  workflow_task_dispatched: {
    workflow_key: string;
    task_key: string;
    target_type: "cross_app" | "internal_operator";
    target_app: string;
    target_capability: string;
    correlation_id: string;
  };
  workflow_task_completed: {
    workflow_key: string;
    task_key: string;
    target_type: "cross_app" | "internal_operator";
    target_app: string;
    target_capability: string;
    correlation_id: string;
    latency_ms: number;
    /**
     * Tiny, PII-safe summary of the task output. For cross_app this
     * is typically `{ routed: true }`; for internal_operator, the
     * operator's executor is responsible for returning summary-safe
     * fields (counts, ids, error codes — no raw payloads).
     */
    output_summary?: Record<string, unknown>;
  };
  workflow_task_failed: {
    workflow_key: string;
    task_key: string;
    target_type: "cross_app" | "internal_operator";
    target_app: string;
    target_capability: string;
    correlation_id: string;
    latency_ms: number;
    error_class: string;
    /** Generic error message; safe to surface. No stack, no PII. */
    error_message: string;
  };

  // ── Phase 4: Authority Grants (Kinetiks Contract Addendum §2) ──
  // Every authority-related event carries `grant_id` so a SQL filter
  // on detail->>'grant_id' reconstructs the full grant audit trail.
  // The `kinetiks_ledger.grant_id` column added in migration 00052 is
  // the indexed equivalent; detail.grant_id is the typed mirror.
  //
  // PII rules per CLAUDE.md: detail carries IDs, counts, action class
  // strings, and structured summaries only. Never full action_input
  // payloads, recipient emails, or prompt text.
  authority_grant_proposed: {
    grant_id: string;
    /** The Authority Agent invocation that produced the proposal. */
    invocation_id: string;
    request_type:
      | "campaign_launch"
      | "workflow_start"
      | "standing_review"
      | "first_connect";
    /** Lookup tag for fixture filtering; "kinetiks_fixtures" for fixture flows. */
    source_label: string;
    /** Action classes the proposed grant covers. */
    action_classes: string[];
    scope_type: "campaign" | "workflow" | "program" | "standing";
    /** For nested-bundle proposals; null for root proposals. */
    parent_grant_id: string | null;
  };
  authority_grant_approved: {
    grant_id: string;
    /** The approval row that recorded the customer decision. */
    approval_id: string;
    /** True when the customer edited before approving. */
    edits_applied: boolean;
    /** Plain-language edit categories the customer changed (≤ 8). */
    edit_categories?: string[];
  };
  authority_grant_paused: {
    grant_id: string;
    /** Optional reason the customer typed when pausing. */
    pause_reason: string | null;
  };
  authority_grant_resumed: {
    grant_id: string;
    /**
     * Optional reason the customer typed when resuming. Resume is a
     * `paused → active` lifecycle transition driven from the Cortex
     * Authority tab (apps/id/src/lib/cortex/authority/lifecycle.ts);
     * the dedicated event type closes the audit-trail gap between
     * pause and revoke.
     */
    resume_reason: string | null;
  };
  authority_grant_narrowed: {
    grant_id: string;
    /** The new (tighter) grant proposed for re-approval; the original is
     *  revoked with reason `customer_narrowed` when the new one approves. */
    successor_grant_id: string;
    /** Plain-language summary of what changed (≤ 8 entries). */
    changes_summary: string[];
  };
  authority_grant_revoked: {
    grant_id: string;
    /**
     * The canonical revocation reason. Surfaced verbatim in the
     * Authority tab history view; `customer_note` carries any
     * additional free-text explanation.
     */
    revocation_reason: AuthorityRevocationReason;
    /** Optional plain-language explanation supplied by the customer. */
    customer_note?: string;
  };
  authority_grant_expired: {
    grant_id: string;
    /** Grant's expires_at as it was at the time of expiry. */
    expired_at: string;
    /** Aggregate count of actions taken before expiry. */
    actions_taken_under_grant: number;
  };
  authority_action_taken: {
    grant_id: string;
    /** Action class the grant covered for this action. */
    action_class: string;
    /** Tool name that executed. */
    tool_name: string;
    /** PII-safe summary of the action input (IDs, counts, lengths — never
     *  full content, recipient emails, or message bodies). */
    action_input_summary: Record<string, string | number | boolean | string[]>;
    /** Optional outcome the tool reported (e.g. event_id, draft_id). */
    outcome_ref?: string;
  };
  authority_action_escalated: AuthorityActionEscalatedDetail;
}

/** Canonical revocation reasons recorded on `authority_grant_revoked`. */
export type AuthorityRevocationReason =
  | "customer_revoked"
  | "customer_narrowed"
  | "customer_edited"
  | "fixture_cleanup";

/** Trigger types referenced by `authority_action_escalated` when a trigger fires. */
export type AuthorityEscalationTriggerType =
  | "anomaly"
  | "novelty"
  | "pacing"
  | "threshold"
  | "llm_judged";

/**
 * Discriminated union for the `authority_action_escalated` Ledger
 * detail per Kinetiks Contract Addendum §2.10. Only the
 * `trigger_fired` variant carries `trigger_type` and `trigger_index`;
 * structural failures (constraint, rate, envelope) do not.
 *
 * Common fields live on `AuthorityActionEscalatedBase` and every
 * variant intersects them.
 */
interface AuthorityActionEscalatedBase {
  grant_id: string;
  action_class: string;
  tool_name: string;
  /** Plain-language explanation; safe to surface in the approval card. */
  detail: string;
  /** Approval ID created to surface the action for per-action review.
   *  Null when the action was denied outright (no approval enqueued). */
  approval_id: string | null;
  /** True when the resolver returned `denied` instead of `escalated`. */
  denied?: boolean;
}

export type AuthorityActionEscalatedDetail =
  | (AuthorityActionEscalatedBase & {
      reason_code: "trigger_fired";
      trigger_type: AuthorityEscalationTriggerType;
      trigger_index?: number;
    })
  | (AuthorityActionEscalatedBase & {
      reason_code:
        | "constraint_failed"
        | "rate_limited"
        | "envelope_exceeded"
        | "missing_budget";
      trigger_type?: never;
      trigger_index?: never;
    });

/**
 * All legal `event_type` strings. Derived from the keys of
 * LedgerEventDetailMap so adding a new event in one place updates
 * the union and the discriminated entry type below.
 */
export type LedgerEventType = keyof LedgerEventDetailMap;

/**
 * Discriminated union: each LedgerEntry variant carries an event_type
 * and the matching detail shape. Readers narrow on event_type to
 * access typed detail fields.
 *
 * detail is the typed shape PLUS an open extension: writers may
 * include arbitrary additional fields (legacy writers add display
 * fields the typed map doesn't enumerate, and that is allowed without
 * cascading type errors). Readers that access untyped extras should
 * narrow the access via index notation.
 *
 * `account_id` is nullable because some platform-level events (e.g.
 * archivist_cron_run summaries) are not scoped to a single account.
 */
export type LedgerEntry = {
  [K in LedgerEventType]: {
    id: string;
    account_id: string | null;
    event_type: K;
    source_app: string | null;
    source_operator: string | null;
    target_layer: ContextLayer | null;
    detail: LedgerEventDetailMap[K] & { [key: string]: unknown };
    created_at: string;
  };
}[LedgerEventType];
