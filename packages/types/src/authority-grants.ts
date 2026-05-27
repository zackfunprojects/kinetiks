/**
 * Authority Grants — per the Kinetiks Contract Addendum §2.
 *
 * An Authority Grant is an explicit, scoped, time-bounded, user-approved
 * delegation of decision authority from the customer to the system. It
 * declares: "within this scope, for this duration, the system may take
 * these classes of action without surfacing each one for approval,
 * subject to these constraints and these escalation conditions."
 *
 * Hybrid table per addendum §2.3 and Lesson 2: top-level columns for
 * indexable lifecycle/scope fields; jsonb for variable-shape
 * `granted_capabilities`, `escalation_triggers`, and `usage_summary`.
 * The shared read helper at `apps/id/src/lib/cortex/authority/list.ts`
 * (Phase 4 — Chunk 4) returns rows in this typed shape; no raw selects
 * from feature code.
 *
 * Append-only contract per CLAUDE.md. Breaking changes require a
 * platform-contract version bump.
 */

// ============================================================
// Lifecycle status
// ============================================================

/**
 * Authority Grant lifecycle per addendum §2.3 and the server-side
 * state machine registered in `apps/id/src/lib/state-machines-init.ts`
 * under entity key `kinetiks_authority_grants`.
 *
 * Legal transitions:
 *   proposed → active   (customer approval through the Approval System)
 *   active   → paused   (customer pause from the Cortex Authority tab)
 *   active   → revoked  (customer revoke from the Cortex Authority tab)
 *   active   → expired  (system, on expires_at)
 *   paused   → active   (customer resume)
 *   paused   → revoked  (customer revoke from paused state)
 *   paused   → expired  (system, on expires_at)
 *
 * `revoked` and `expired` are terminal.
 *
 * Narrowing is NOT a lifecycle transition. Customer narrowing produces
 * a new `proposed` grant whose acceptance revokes the previous one
 * (see addendum §2.13 and the AuthorityGrantCard narrow flow).
 */
export type AuthorityGrantStatus =
  | "proposed"
  | "active"
  | "paused"
  | "revoked"
  | "expired";

/**
 * Scope of an Authority Grant per addendum §2.3. The Agent Runtime's
 * authority resolution flow uses scope_type + scope_id (and the
 * narrowest-scope-wins rule) to pick the covering grant for an action.
 */
export type AuthorityGrantScopeType =
  | "campaign"
  | "workflow"
  | "program"
  | "standing";

// ============================================================
// Escalation triggers
// ============================================================

/**
 * Five escalation trigger types in v1 per addendum §2.10.
 *
 * - `anomaly`: statistical anomaly in the metric stream relevant to
 *   this action. v1 reads `kinetiks_metric_cache` directly; full
 *   Oracle integration is deferred.
 * - `novelty`: action parameters differ significantly from prior
 *   actions taken under authority on this account.
 * - `pacing`: rate of actions under this grant is significantly off
 *   the historical baseline.
 * - `threshold`: explicit numeric thresholds on action parameters
 *   (spend, percentage change, count in a window).
 * - `llm_judged`: an LLM is asked to evaluate the action in context;
 *   budgeted per-class in the Action Class Registry.
 *
 * Per-type `condition` payload schemas live in
 * `packages/types/src/authority-triggers.ts`. The runtime evaluator
 * (Phase 4 — Chunk 4) parses each trigger's condition against the
 * matching schema before evaluation.
 */
export type EscalationTriggerType =
  | "anomaly"
  | "novelty"
  | "pacing"
  | "threshold"
  | "llm_judged";

/**
 * One escalation trigger declared on a grant. The `description` field
 * is plain-language (rendered in the Approval card and the Cortex
 * Authority tab). The `condition` field is machine-readable; its
 * shape is gated by the matching Zod schema in
 * `packages/types/src/authority-triggers.ts`.
 */
export interface EscalationTrigger {
  type: EscalationTriggerType;
  /** Plain-language explanation for the customer; renders on cards. */
  description: string;
  /** Per-type structured config; validated against the trigger schema. */
  condition: Record<string, unknown>;
}

// ============================================================
// Granted capability
// ============================================================

/**
 * One capability granted under an Authority Grant per addendum §2.3.
 *
 * Each capability references a registered `action_class`. The
 * `constraints` payload is validated against the matching
 * `ActionClassDescriptor.constraint_schema` at proposal time and
 * again at resolution time. The `rate_limit` caps the rate of actions
 * the grant may take; the grant rate may only tighten (never exceed)
 * the action class's `rate_limit_default`.
 *
 * `llm_judgment_budget_override` is additive expansion of the class-
 * level cap (effective_cap = max(class.cap, override.cap)). Bounded by
 * parent grant per addendum §2.8 nesting rules.
 */
export interface GrantedCapability {
  /** Registered action class key, e.g. "kinetiks_id.send_slack_notification". */
  action_class: string;
  /** Plain-language sentence rendered on the customer-facing card. */
  description: string;
  /** Validated against `ActionClassDescriptor.constraint_schema`. */
  constraints: Record<string, unknown>;
  /** Caps the rate; never exceeds the action class's `rate_limit_default`. */
  rate_limit: {
    count: number;
    window: "minute" | "hour" | "day" | "week";
  } | null;
  /** Optional grant-level override of the per-class LLM judgment budget. */
  llm_judgment_budget_override?: {
    daily_usd?: number;
    monthly_usd?: number;
  };
}

// ============================================================
// Usage summary
// ============================================================

/**
 * Rolling aggregate computed nightly per addendum §2.3 and §2.12. The
 * `usage_summary` is NOT mutated per-action; per-action events live as
 * Ledger entries with `grant_id` attached, and a nightly rollup job
 * (Phase 4 — Chunk 4 `apps/id/src/lib/cortex/authority/usage-summary-rollup.ts`)
 * aggregates them into this block. Customers see the rollup, not the
 * individual events, in the Authority tab.
 */
export interface AuthorityUsageSummary {
  /** Per-action_class count of `authority_action_taken` Ledger entries. */
  action_counts: Record<string, number>;
  /** Cumulative spend logged under this grant (always 0 in v1). */
  total_spend_under_grant: number;
  /** Cumulative `authority_action_escalated` Ledger entries. */
  escalations_triggered: number;
  /** Optional per-metric outcomes attributed to the grant. */
  outcome_metrics: Record<string, number>;
  /** Timestamp of the last rollup pass. */
  computed_at: string;
}

// ============================================================
// Authority Grant (read shape)
// ============================================================

/**
 * The shape returned by `apps/id/src/lib/cortex/authority/list.ts`
 * (Phase 4 — Chunk 4), the Cortex Authority UI Server Component, and
 * the resolver's grant-reader interface.
 *
 * Hybrid table per Lesson 2 and addendum §2.3: top-level columns are
 * indexed and used for filtering on the resolver's hot path (status +
 * expires_at + scope_type + scope_id + jsonb containment on
 * granted_capabilities); the jsonb columns carry the variable-shape
 * payload.
 *
 * `team_scope_id` is the v2 multi-user placeholder; always null in v1.
 */
export interface AuthorityGrant {
  id: string;
  account_id: string;
  /** v2 multi-user placeholder; always null in v1. */
  team_scope_id: string | null;
  /** The user_id of the customer who approved (or proposed) the grant. */
  granted_by: string;

  // Scope
  scope_type: AuthorityGrantScopeType;
  /** Reference to the scoped object (campaign_id, workflow_id, program_id); null for standing grants. */
  scope_id: string | null;
  /** Plain-language scope label, e.g. "Acme Q1 LinkedIn Campaign". */
  scope_description: string;

  // Nesting (addendum §2.8)
  /** Set when this grant nests inside a parent (typically Workflow inside Program). */
  parent_grant_id: string | null;

  // Envelope (jsonb on the row, typed here)
  granted_capabilities: GrantedCapability[];
  escalation_triggers: EscalationTrigger[];

  // Spending envelope (per addendum §2.11; always operates inside Budget)
  /** Cap on spend per UTC day under this grant; null if non-spend-bearing. */
  max_unapproved_spend_per_day: number | null;
  /** Cap on spend per single action under this grant; null if non-spend-bearing. */
  max_unapproved_spend_per_action: number | null;
  /** ISO 4217 currency code, e.g. "USD". */
  spending_currency: string;

  // Lifecycle
  status: AuthorityGrantStatus;
  /** Authority Agent invocation_id that proposed this grant. */
  proposed_by_agent: string | null;
  proposed_at: string;
  /** Set when status transitions `proposed → active`. */
  granted_at: string | null;
  /** Auto-revoke timestamp; null for indefinite grants. */
  expires_at: string | null;
  /** Set when status transitions to `revoked` or `expired`. */
  revoked_at: string | null;
  /** Free-text reason captured on revoke (customer-supplied or system-generated). */
  revocation_reason: string | null;

  // Learning (jsonb on the row, typed here)
  usage_summary: AuthorityUsageSummary;

  created_at: string;
  updated_at: string;
}

// ============================================================
// Proposal envelope (Authority Agent output shape)
// ============================================================

/**
 * The Authority Agent emits a `GrantProposalEnvelope` per invocation
 * containing one root grant plus optional nested child grants. Phase 4
 * v1 supports up to one root + two children (envelope cap of 3).
 *
 * Each member carries the proposed grant payload, a pre-generated
 * grant_id (so the bundle can reference parent_grant_id without a
 * second insert pass), reasoning for the customer review card, and
 * the evidence the agent used. The evidence is informational — it is
 * surfaced in the approval card so customers can see WHY this shape.
 */
export interface GrantProposalEnvelopeMember {
  /** Pre-generated UUID so children can reference the parent's id. */
  grant_id: string;
  /**
   * The grant payload to persist (sans lifecycle fields, which are set
   * by the persistence RPC). Status is implied `proposed`.
   */
  grant: Omit<
    AuthorityGrant,
    | "id"
    | "status"
    | "proposed_at"
    | "granted_at"
    | "expires_at"
    | "revoked_at"
    | "revocation_reason"
    | "proposed_by_agent"
    | "usage_summary"
    | "created_at"
    | "updated_at"
    | "account_id"
    | "granted_by"
    | "team_scope_id"
  > & {
    /** Customer-editable expiry; null for indefinite. */
    expires_at: string | null;
  };
  /** Agent's explanation of why this shape; surfaced in the approval card. */
  reasoning: string;
  /** Evidence the agent used; surfaced in the approval card. */
  evidence: GrantProposalEvidence;
}

export interface GrantProposalEvidence {
  /** Pattern Library IDs the agent referenced. */
  patterns_referenced: Array<{
    pattern_id: string;
    pattern_type: string;
    lift_ratio: number | null;
    /** ≤ 200 chars; plain-language. */
    why_relevant: string;
  }>;
  /** Prior grant IDs the agent learned from. */
  similar_past_grants: Array<{
    grant_id: string;
    outcome:
      | "approved_as_proposed"
      | "approved_with_edits"
      | "rejected"
      | "expired_clean"
      | "expired_with_escalations";
    /** Edit categories the customer applied last time (if any). */
    common_edits_applied: string[];
  }>;
  /** Ledger summary stats over the last 90 days. */
  ledger_summary: {
    proposals_last_90d: number;
    approval_rate: number;
    most_common_edit_type: string | null;
  };
  /** Plain-language identity signals the agent leaned on (≤ 8). */
  identity_signals: string[];
}

export interface GrantProposalEnvelope {
  invocation_id: string;
  request_type:
    | "campaign_launch"
    | "workflow_start"
    | "standing_review"
    | "first_connect";
  /** 1-3 members; root first, children reference parent's grant_id. */
  proposed_grants: GrantProposalEnvelopeMember[];
}
