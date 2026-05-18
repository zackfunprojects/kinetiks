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
}

/**
 * All legal `event_type` strings. Derived from the keys of
 * LedgerEventDetailMap so adding a new event in one place updates
 * the union and the discriminated entry type below.
 */
export type LedgerEventType = keyof LedgerEventDetailMap;

/**
 * Discriminated union: each LedgerEntry variant carries an event_type
 * and the matching detail shape. Readers narrow on event_type to
 * access detail fields.
 *
 * Note: `account_id` is nullable because some platform-level events
 * (e.g. archivist_cron_run summaries) are not scoped to a single
 * account.
 */
export type LedgerEntry = {
  [K in LedgerEventType]: {
    id: string;
    account_id: string | null;
    event_type: K;
    source_app: string | null;
    source_operator: string | null;
    target_layer: ContextLayer | null;
    detail: LedgerEventDetailMap[K];
    created_at: string;
  };
}[LedgerEventType];
