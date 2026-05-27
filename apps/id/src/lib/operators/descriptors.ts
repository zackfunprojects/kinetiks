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
    "Conversational + orchestration operator. Builds evidence briefs, picks platform tools, drafts Chat responses, and emits action proposals through the Approval System. Phase 3 registers the descriptor and tool whitelist; the executor remains the existing chat path.",
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
  ],
  required_patterns: [],
  action_classes: [],
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
// Authority Agent (Phase 3: stub; Phase 4 lands the real impl)
// ============================================================

export const authorityAgentStub: OperatorDescriptor = {
  key: "authority_agent",
  description:
    "Authority Agent (Phase 4 stub). Proposes Authority Grants from the Pattern Library, Learning Ledger, and Budget context. Never approves, never executes; the customer always approves. Phase 3 registers the descriptor only; Phase 4 ships the real proposal engine.",
  inputs_schema: z.unknown(),
  outputs_schema: z.unknown(),
  required_tools: [],
  required_patterns: [],
  action_classes: [],
};
