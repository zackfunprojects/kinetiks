/**
 * Operator descriptors for Kinetiks Core (app key: `kinetiks_id`).
 *
 * Per the Kinetiks Contract Addendum §3.3. Each descriptor declares
 * the operator's identity (key, description), the contract its
 * executor must honour (`inputs_schema`, `outputs_schema`), and the
 * platform references it relies on (`required_tools`,
 * `required_patterns`, `action_classes`).
 *
 * Cross-registry validation at boot (`assertRegistriesValid()` inside
 * `bootToolRegistry()`) verifies every reference resolves — a typo
 * or stale entry fails the process at startup rather than at runtime.
 *
 * Phase 3 scope:
 *  - Archivist is the only operator with a real executor; its schemas
 *    constrain the dispatcher.
 *  - The other four (Cartographer, Marcus, Oracle, Authority Agent
 *    stub) register their descriptors so the registry is complete and
 *    so future Workflows can address them; their executors throw
 *    `not_implemented` until their respective phases land.
 *  - `action_classes` is `[]` everywhere because the Action Class
 *    Registry has no entries yet (those land in Phase 4). When Phase
 *    4 introduces classes, the relevant descriptors here gain
 *    references in the same PR that registers the classes.
 *  - `required_patterns` is `[]` until L1a wires pattern reads
 *    through the `query_patterns` tool path for these operators.
 */

import { z } from "zod";
import type { OperatorDescriptor } from "@kinetiks/types";

// ============================================================
// Archivist (Phase 3: real executor)
// ============================================================

/**
 * Step the Archivist operator should run. Matches the four passes the
 * `archivist-cron` Edge Function runs today (clean, decay sweep,
 * deferred-emission close, empirical decay calibration). The
 * `calibrate` step is normally only invoked on the 00:00 UTC tick;
 * callers signal that intent via `only_at_utc_hour`, and the
 * executor no-ops outside the matching hour.
 */
export const ARCHIVIST_STEP_VALUES = [
  "clean",
  "sweep",
  "sweep_deferred",
  "calibrate",
] as const;
export type ArchivistStep = (typeof ARCHIVIST_STEP_VALUES)[number];

export const archivistInputsSchema = z.object({
  step: z.enum(ARCHIVIST_STEP_VALUES),
  account_ids: z.array(z.string().uuid()).min(0),
  /**
   * If set, the step only runs when the current UTC hour matches.
   * `calibrate` uses this to mirror the existing cron behaviour
   * (00:00 UTC tick only). Other steps usually omit this.
   */
  only_at_utc_hour: z.number().int().min(0).max(23).optional(),
});
export type ArchivistInput = z.infer<typeof archivistInputsSchema>;

export const archivistOutputsSchema = z.object({
  step: z.enum(ARCHIVIST_STEP_VALUES),
  accounts_processed: z.number().int().min(0),
  errors: z.number().int().min(0),
  /** True when the step skipped because `only_at_utc_hour` did not match. */
  skipped: z.boolean().optional(),
  /** Step-specific counts; carried into Ledger output_summary verbatim. */
  step_metrics: z.record(z.union([z.number(), z.string(), z.boolean(), z.null()])).optional(),
});
export type ArchivistOutput = z.infer<typeof archivistOutputsSchema>;

export const archivist: OperatorDescriptor = {
  key: "archivist",
  description:
    "Cortex Archivist. Owns Cortex layer hygiene (dedup, normalize, gap detect, quality score), Pattern Library lifecycle sweeps, deferred-emission closure, and Phase 2 empirical decay calibration. Routed step-by-step via the archivist-maintenance Workflow.",
  inputs_schema: archivistInputsSchema,
  outputs_schema: archivistOutputsSchema,
  required_tools: [],
  required_patterns: [],
  action_classes: [],
};

// ============================================================
// Cartographer (Phase 3: stub)
// ============================================================

export const cartographer: OperatorDescriptor = {
  key: "cartographer",
  description:
    "Cortex Cartographer. Builds and refreshes the Context Structure from onboarding inputs and crawled artifacts. Phase 3 registers the descriptor; the executor lands in a later phase.",
  inputs_schema: z.unknown(),
  outputs_schema: z.unknown(),
  required_tools: [],
  required_patterns: [],
  action_classes: [],
};

// ============================================================
// Marcus (Phase 3: stub; descriptor declares the tools Marcus already picks today)
// ============================================================

/**
 * Marcus's tool whitelist mirrors what the chat path picks from the
 * Tool Registry today (`apps/id/src/lib/tools/registry-boot.ts`).
 * Declaring them here makes the operator addressable and validates at
 * boot that every tool Marcus is allowed to invoke is actually
 * registered.
 *
 * The Marcus executor itself stays stubbed in Phase 3; the
 * conversational and orchestration code paths remain in their current
 * locations (`apps/id/src/lib/marcus/`). When/if Marcus is invoked via
 * an internal Workflow in a later phase, the executor wires up to
 * those code paths.
 */
export const marcus: OperatorDescriptor = {
  key: "marcus",
  description:
    "Conversational + orchestration operator. Builds evidence briefs, picks platform tools, drafts Chat responses, and emits action proposals through the Approval System. Phase 3 registers the descriptor and tool whitelist; Phase 4 adds the three action-bearing tools (Slack notify / draft email / calendar event) gated by Authority Grants; the executor remains the existing chat path.",
  inputs_schema: z.unknown(),
  outputs_schema: z.unknown(),
  required_tools: [
    "query_patterns",
    "list_capabilities",
    "query_insights",
    "ga4_query",
    "gsc_query",
    "stripe_query",
    "meta_ads_query",
    "google_ads_query",
    "query_actions_authority",
    "noop_test",
    // Phase 4 — Chunk 6 — action-bearing tools.
    "send_slack_notification",
    "draft_email",
    "add_calendar_event",
  ],
  required_patterns: [],
  action_classes: [
    // Phase 4 — Chunk 6 — declare every action class Marcus may invoke
    // so the cross-registry validator at boot can match each tool's
    // actionClass to a registered class.
    "kinetiks_id.send_slack_notification",
    "kinetiks_id.draft_email",
    "kinetiks_id.add_calendar_event",
  ],
};

// ============================================================
// Oracle (Phase 3: stub)
// ============================================================

export const oracle: OperatorDescriptor = {
  key: "oracle",
  description:
    "Analytics intelligence operator. Synthesizes metrics across connected data sources into insights, anomaly alerts, and Budget proposals. Phase 3 registers the descriptor; the executor remains the existing oracle-analysis path.",
  inputs_schema: z.unknown(),
  outputs_schema: z.unknown(),
  required_tools: [
    "ga4_query",
    "gsc_query",
    "stripe_query",
    "meta_ads_query",
    "google_ads_query",
  ],
  required_patterns: [],
  action_classes: [],
};

// ============================================================
// Authority Agent (Phase 4: real implementation)
// ============================================================

/**
 * Per the Kinetiks Contract Addendum §2.5 the agent never executes
 * actions and never approves grants — the customer always approves.
 * Phase 4 v1 wires only the `campaign_launch` request type end-to-end;
 * the other three are accepted at the input boundary but the executor
 * raises `not_implemented` until Phase 5 ships the standing-grant
 * review and first-connect surfaces.
 */
export const AUTHORITY_AGENT_REQUEST_TYPES = [
  "campaign_launch",
  "workflow_start",
  "standing_review",
  "first_connect",
] as const;
export type AuthorityAgentRequestType =
  (typeof AUTHORITY_AGENT_REQUEST_TYPES)[number];

const grantedCapabilityInputSchema = z.object({
  action_class: z.string().min(1),
  description: z.string().min(8).max(280),
  constraints: z.record(z.unknown()),
  rate_limit: z
    .object({
      count: z.number().int().positive(),
      window: z.enum(["minute", "hour", "day", "week"]),
    })
    .nullable(),
  llm_judgment_budget_override: z
    .object({
      daily_usd: z.number().nonnegative().optional(),
      monthly_usd: z.number().nonnegative().optional(),
    })
    .optional(),
});

const escalationTriggerInputSchema = z.object({
  type: z.enum(["anomaly", "novelty", "pacing", "threshold", "llm_judged"]),
  description: z.string().min(1).max(280),
  condition: z.record(z.unknown()),
});

export const proposedGrantPayloadSchema = z.object({
  scope_type: z.enum(["campaign", "workflow", "program", "standing"]),
  scope_id: z.string().nullable(),
  scope_description: z.string().min(1).max(200),
  parent_grant_id: z.string().uuid().nullable(),
  granted_capabilities: z
    .array(grantedCapabilityInputSchema)
    .min(1)
    .max(10),
  escalation_triggers: z.array(escalationTriggerInputSchema).max(8),
  max_unapproved_spend_per_day: z.number().nullable(),
  max_unapproved_spend_per_action: z.number().nullable(),
  spending_currency: z.literal("USD"),
  expires_at: z.string().datetime().nullable(),
});

const grantProposalEvidenceSchema = z.object({
  patterns_referenced: z
    .array(
      z.object({
        pattern_id: z.string().uuid(),
        pattern_type: z.string(),
        lift_ratio: z.number().nullable(),
        why_relevant: z.string().min(1).max(200),
      }),
    )
    .max(20),
  similar_past_grants: z
    .array(
      z.object({
        grant_id: z.string().uuid(),
        outcome: z.enum([
          "approved_as_proposed",
          "approved_with_edits",
          "rejected",
          "expired_clean",
          "expired_with_escalations",
        ]),
        common_edits_applied: z.array(z.string()).max(8),
      }),
    )
    .max(10),
  ledger_summary: z.object({
    proposals_last_90d: z.number().int().nonnegative(),
    approval_rate: z.number().min(0).max(1),
    most_common_edit_type: z.string().nullable(),
  }),
  identity_signals: z.array(z.string().min(1)).max(8),
});

const grantProposalEnvelopeMemberSchema = z.object({
  grant_id: z.string().uuid(),
  grant: proposedGrantPayloadSchema,
  reasoning: z.string().min(40).max(2000),
  evidence: grantProposalEvidenceSchema,
});

// Bounded tuple: 1 root + ≤2 children per the Phase 4 cap on the
// persistence RPC. Matches the type-level ProposedGrantBundle in
// @kinetiks/types/authority-grants.
const proposedGrantsBundleSchema = z.union([
  z.tuple([grantProposalEnvelopeMemberSchema]),
  z.tuple([
    grantProposalEnvelopeMemberSchema,
    grantProposalEnvelopeMemberSchema,
  ]),
  z.tuple([
    grantProposalEnvelopeMemberSchema,
    grantProposalEnvelopeMemberSchema,
    grantProposalEnvelopeMemberSchema,
  ]),
]);

// Input variants per the four request types.
const baseInputFields = {
  account_id: z.string().uuid(),
  user_id: z.string().uuid(),
  invocation_id: z.string().uuid(),
  /** Tag that flows through into Ledger detail for fixture filtering. */
  source_label: z.string().min(1).max(64).default("marcus"),
};

const campaignLaunchInputSchema = z.object({
  ...baseInputFields,
  type: z.literal("campaign_launch"),
  brief: z.object({
    title: z.string().min(1).max(200),
    summary: z.string().min(1).max(4000),
    target_icp_id: z.string().nullable(),
    requested_action_classes: z.array(z.string().min(1)).min(1).max(20),
    target_start_at: z.string().datetime().optional(),
    target_end_at: z.string().datetime().optional(),
  }),
  parent_grant_id: z.string().uuid().nullable().default(null),
});

const workflowStartInputSchema = z.object({
  ...baseInputFields,
  type: z.literal("workflow_start"),
  workflow_id: z.string().uuid(),
  workflow_description: z.string().min(1).max(4000),
  requested_action_classes: z.array(z.string().min(1)).min(1).max(20),
  parent_grant_id: z.string().uuid().nullable().default(null),
});

const standingReviewInputSchema = z.object({
  ...baseInputFields,
  type: z.literal("standing_review"),
  /** Existing standing grants to consider refreshing. */
  candidate_grant_ids: z.array(z.string().uuid()).max(50),
});

const firstConnectInputSchema = z.object({
  ...baseInputFields,
  type: z.literal("first_connect"),
  app_key: z.string().min(1),
  /** Hash of the app manifest so calibration tracks manifest changes. */
  manifest_hash: z.string().min(1),
});

export const authorityAgentInputsSchema = z.discriminatedUnion("type", [
  campaignLaunchInputSchema,
  workflowStartInputSchema,
  standingReviewInputSchema,
  firstConnectInputSchema,
]);
export type AuthorityAgentInput = z.infer<typeof authorityAgentInputsSchema>;

export const authorityAgentOutputsSchema = z.object({
  invocation_id: z.string().uuid(),
  request_type: z.enum(AUTHORITY_AGENT_REQUEST_TYPES),
  proposed_grant_ids: z.array(z.string().uuid()).min(1).max(3),
  approval_ids: z.array(z.string().uuid()).min(1).max(3),
});
export type AuthorityAgentOutput = z.infer<typeof authorityAgentOutputsSchema>;

// Internal use: the Sonnet proposal output, before persistence.
export const grantProposalEnvelopeSchema = z.object({
  invocation_id: z.string().uuid(),
  request_type: z.enum(AUTHORITY_AGENT_REQUEST_TYPES),
  proposed_grants: proposedGrantsBundleSchema,
});

export const authorityAgent: OperatorDescriptor = {
  key: "authority_agent",
  description:
    "Authority Agent (Kinetiks Contract Addendum §2.5). Proposes Authority Grants from Pattern Library evidence, the Learning Ledger, and Budget context. Never approves; the customer always approves. Never executes; only proposes. Phase 4 v1 wires the campaign_launch request type end-to-end; workflow_start / standing_review / first_connect raise not_implemented until Phase 5.",
  inputs_schema: authorityAgentInputsSchema,
  outputs_schema: authorityAgentOutputsSchema,
  required_tools: ["query_patterns", "query_actions_authority"],
  // Wildcard sentinel per Phase 4 D3: the agent reads every pattern
  // type whose `read_apps` includes `kinetiks_id`. The registry
  // validator treats `*` as auto-resolved; the actual allowlist
  // enforcement happens inside `listPatterns()` at read time.
  required_patterns: ["*"],
  // The agent proposes OVER action classes; it never invokes them itself.
  action_classes: [],
};

