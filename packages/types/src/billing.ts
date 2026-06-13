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
  approval_created: {
    approval_id?: string;
    approval_type?: string;
    confidence_score?: number;
    auto_approved?: boolean;
  };
  approval_auto_approved: {
    approval_id?: string;
    approval_type?: string;
    confidence_score?: number;
    auto_approved?: boolean;
  };
  approval_approved: { approval_id?: string; approval_type?: string };
  approval_approved_with_edits: { approval_id?: string; approval_type?: string };
  approval_batch_approved: { approval_ids?: string[]; count?: number };
  approval_expired: { approval_id?: string };
  approval_flagged: { approval_id?: string; reason?: string };
  approval_rejected: { approval_id?: string; reason?: string };

  // ── Marcus ────────────────────────────────────────────────
  /** One conversational turn (engine.ts), for confidence-recalibration analytics. */
  marcus_turn: {
    thread_id?: string;
    intent_type?: string;
    brief_evidence_count?: number;
    brief_gap_count?: number;
    memory_count?: number;
    action_count?: number;
    response_length?: number;
    streaming?: boolean;
  };
  marcus_daily_brief: { thread_id?: string; insight_count?: number };
  marcus_weekly_digest: { thread_id?: string };
  marcus_monthly_review: { thread_id?: string };
  command_executed: { command?: string; target_app?: string };

  // ── Cartographer ──────────────────────────────────────────
  cartographer_analyze: { layer?: string; field_count?: number };
  // Phase 4.5 reconciliation: legacy events from early Phase 1
  // Cartographer development, preserved in production data. Detail
  // shapes documented from the audit at
  // docs/operational/phase-4.5-audit-2026-05-27.md.
  cartographer_crawl: {
    url: string;
    success: boolean;
    timestamp?: string;
    source_operator?: string;
    proposals_submitted?: number;
  };
  cartographer_calibrate: {
    choice: "A" | "B";
    exercise: string;
    dimension: string;
    timestamp?: string;
    adjusted_to: number;
    adjusted_from: number;
    proposal_status?: "accepted" | "declined";
    source_operator?: string;
    chosen_direction?: "high" | "low";
  };

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
    /**
     * The approval row that recorded the customer decision. Null for
     * the Phase 5 default-at-signup path where the customer approves
     * defaults inline in the onboarding flow and no
     * `kinetiks_approvals` row is created (the signup gesture itself
     * is the approval). For every other path — campaign / workflow /
     * program proposals approved via the Approvals UI, manifest-diff
     * proposals approved via the Approvals UI — this is non-null and
     * references the approval row.
     */
    approval_id: string | null;
    /** True when the customer edited before approving. */
    edits_applied: boolean;
    /** Plain-language edit categories the customer changed (≤ 8). */
    edit_categories?: string[];
    /**
     * Provenance label mirroring `authority_grant_proposed.source_label`.
     * Phase 5 introduces `"default_at_signup"` (inline signup acceptance)
     * and `"default_manifest_diff"` (manifest diff cron proposal,
     * approved later via the Approvals UI). Other paths leave it unset
     * for backward compatibility with Phase 4 callers.
     */
    source_label?: string;
  };
  authority_grant_paused: {
    grant_id: string;
    /** Optional reason the customer typed when pausing. */
    pause_reason: string | null;
    /** Acting user_id (kinetiks user). v2 multi-user audit forward-compat. */
    actor_user_id?: string;
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
    /** Acting user_id (kinetiks user). v2 multi-user audit forward-compat. */
    actor_user_id?: string;
  };
  authority_grant_narrowed: {
    grant_id: string;
    /** The new (tighter) grant proposed for re-approval; the original is
     *  revoked with reason `customer_narrowed` when the new one approves. */
    successor_grant_id: string;
    /** Plain-language summary of what changed (≤ 8 entries). */
    changes_summary: string[];
    /** Acting user_id (kinetiks user). v2 multi-user audit forward-compat. */
    actor_user_id?: string;
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
    /** Acting user_id (kinetiks user) when revocation was customer-driven.
     *  Null/absent for system-driven revocations (e.g. fixture cleanup). */
    actor_user_id?: string;
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

  // ── Phase 5: Default Standing Grants (Kinetiks Contract Addendum §2.6) ──
  // Three events for the default-standing-grants lifecycle that do not
  // map onto the Phase 4 grant_id-bearing events: rejected and skipped
  // never produce a grant, and re-proposed pairs alongside a regular
  // authority_grant_proposed entry to add cooldown provenance.
  //
  // PII rules: detail carries provenance keys, app names, and the
  // prior-rejection timestamp only. No customer notes, no constraint
  // payloads.
  authority_default_rejected: {
    /** Manifest app that declared the rejected default. */
    default_origin_app: string;
    /** Stable manifest key of the rejected default. */
    default_origin_key: string;
    /**
     * Where the rejection happened.
     *   - `default_at_signup`: customer un-checked the default during
     *     the onboarding Permissions step. No proposal or grant ever
     *     existed.
     *   - `default_manifest_diff`: customer explicitly rejected a
     *     cron-proposed default via the standard Approvals UI. A
     *     companion `authority_grant_revoked` entry with the same
     *     grant_id captures the lifecycle side; this entry adds the
     *     default-flow provenance.
     */
    source_label: "default_at_signup" | "default_manifest_diff";
  };
  authority_default_skipped: {
    /** Manifest app whose defaults were skipped. */
    default_origin_app: string;
    /** Stable manifest key skipped (one entry per manifest key on Skip). */
    default_origin_key: string;
    /** Always `default_at_signup` in v1 — skip only exists on the signup path. */
    source_label: "default_at_signup";
  };
  authority_default_re_proposed: {
    /** The newly-proposed grant id from the matching `authority_grant_proposed` entry. */
    grant_id: string;
    /** Manifest app and key the re-proposal covers. */
    default_origin_app: string;
    default_origin_key: string;
    /**
     * Timestamp of the customer's most recent prior rejection or skip
     * for this (app, key). The diff cron uses a 30-day cooldown; this
     * timestamp shows how long the system waited before asking again.
     */
    prior_rejection_at: string;
    /** The kind of prior decision that triggered the cooldown. */
    prior_decision: "rejected" | "skipped";
  };

  // ── Phase 7: Connection lifecycle (Nango Connect end-to-end) ──
  // Four events for the connect / sync / disconnect lifecycle.
  // Sync events mirror kinetiks_sync_logs rows so the Marcus
  // calibration loop and the Cortex history view both consume from
  // a single source. PII rules per CLAUDE.md: error_message is the
  // generic surfaced message, never a stack trace or full payload.
  connection_created: {
    /** Kinetiks connection row id. */
    connection_id: string;
    /** Kinetiks ConnectionProvider value. */
    provider: string;
    /** Nango's stable connection id. */
    nango_connection_id: string;
    /** Nango integration key (matches provider-config.ts). */
    nango_provider_config_key: string;
  };
  connection_revoked: {
    connection_id: string;
    provider: string;
    nango_connection_id: string | null;
    /**
     * Where the revocation originated:
     *   - `customer_revoked`: explicit disconnect via /api/connections/[id]
     *   - `provider_revoked`: Nango fired connection.deleted from the
     *     provider side (e.g. token expired beyond refresh, customer
     *     revoked in the provider's app, scope changed)
     *   - `auth_expired`: refresh token chain broke; Nango cannot
     *     recover without re-auth
     */
    revocation_reason: "customer_revoked" | "provider_revoked" | "auth_expired";
  };
  connection_sync_completed: {
    connection_id: string;
    provider: string;
    /** Nango sync name that completed (e.g. "twitter-recent-posts"). */
    sync_name: string;
    records_added: number;
    records_updated: number;
    records_deleted: number;
    duration_ms: number;
  };
  connection_sync_failed: {
    connection_id: string;
    provider: string;
    sync_name: string;
    /** Coarse error classification: 'rate_limit'|'auth'|'schema'|'network'|'unknown'. */
    error_class: string;
    /** Generic, customer-safe message — never a stack trace. */
    error_message: string;
    duration_ms: number;
  };
  /**
   * D2 — one row per outbound email the named system identity sends
   * (lib/email/sender.ts). Doubles as the counter behind the
   * 20-sends/24h cap (comms spec §2.4). PII rules: no addresses, no
   * subject text, no body content — counts and lengths only.
   */
  system_email_sent: {
    kind: "brief" | "alert" | "summary";
    provider: "gmail" | "resend";
    recipient_count: number;
    subject_length: number;
    body_length: number;
  };
  /**
   * E3 — an agent caller explicitly requested pattern types its
   * read_apps allowlist does not permit (lib/cortex/patterns/list.ts).
   * Registry keys only, never pattern content.
   */
  pattern_read_denied: {
    caller_app: string;
    denied_pattern_types: string[];
    denied_count: number;
  };
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
