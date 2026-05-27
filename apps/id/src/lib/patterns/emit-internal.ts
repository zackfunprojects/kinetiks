/**
 * Phase 1.7 emission helpers for the four kinetiks_id.* pattern types.
 *
 * Wraps the deferred-emit helper with shape-aware functions that the
 * Marcus, Oracle, Cartographer, and connection-evidence call sites use
 * without touching the lower-level deferred-emit API directly.
 *
 * Three of the four are deferred:
 *   - recordMarcusTurnObservation / closeMarcusTurnObservationForThread
 *   - recordInsightDeliveryObservation
 *   - recordConnectionEvidenceObservation /
 *     closeConnectionEvidenceObservation (exact request_id match) /
 *     closeMostRecentConnectionEvidenceForProvider (fuzzy provider match)
 *
 * One is synchronous (outcome known at emission time):
 *   - emitOnboardingQuestionValue
 *
 * Best-effort throughout. Every call wraps errors and returns silently
 * — pattern emission must NEVER block the user-facing operation that
 * triggered it.
 */

import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@kinetiks/lib/env";
import {
  recordDeferredObservation,
  closeDeferredObservation,
  type DeferredObservationInput,
} from "./deferred-emit";

/**
 * Timeout for the synchronous onboarding emission. Best-effort
 * fire-and-forget — must not hang the user-facing operation.
 */
const ONBOARDING_EMIT_FETCH_TIMEOUT_MS = 10_000;

/**
 * Best-effort error capture for the kinetiks_id emission helpers.
 * Patterns emission must never block the user-facing operation, so
 * we route failures through Sentry with structured tags rather than
 * bubbling them up.
 */
function captureEmissionError(action: string, err: unknown, extra: Record<string, unknown> = {}): void {
  Sentry.captureException(err, {
    tags: { route: "emit-internal", action, stage: "emission", app: "id" },
    extra,
  });
}

const KINETIKS_ID_SOURCE_APP = "kinetiks_id" as const;
const PENDING_OBS_TABLE = "kinetiks_pattern_pending_observations" as const;

/**
 * Resolve the patterns endpoint URL relative to the current request
 * origin. Callers that don't have a request (background workers) pass
 * an explicit origin.
 */
function resolvePatternsUrl(origin?: string): string | null {
  const fallback = serverEnv().NEXT_PUBLIC_APP_URL ?? null;
  const base = origin ?? fallback;
  if (!base) return null;
  return `${base}/api/synapse/patterns`;
}

function resolveInternalSecret(): string | null {
  return serverEnv().INTERNAL_SERVICE_SECRET ?? null;
}

/** Default windows per pattern type, in seconds. */
const WINDOWS = {
  marcus_followup_seconds: 4 * 60 * 60, // 4 hours
  insight_action_seconds: 7 * 24 * 60 * 60, // 7 days
  connection_value_seconds: 24 * 60 * 60, // 24 hours
} as const;

// ─────────────────────────────────────────────
// 1. Marcus question resonance
// ─────────────────────────────────────────────

export interface MarcusTurnObservationInput {
  account_id: string;
  thread_id: string;
  message_id: string;
  /** Raw user-question text or summary; bucketize coarsens to a topic_cluster. */
  topic_hint: string;
  /** Raw intent; bucketize coarsens to a question_intent bucket. */
  intent_hint: string;
  /** Raw ICP descriptor; bucketize coarsens to an icp_segment bucket. */
  icp_hint: string;
}

/**
 * Called after Marcus's assistant turn lands. Records a pending
 * observation keyed by `{thread_id}:{message_id}` that the next user
 * message in the thread will close with outcome=1, or that the
 * archivist sweep will close as expired with outcome=0.
 */
export async function recordMarcusTurnObservation(
  input: MarcusTurnObservationInput,
  admin: SupabaseClient,
): Promise<void> {
  try {
    const obs: DeferredObservationInput = {
      account_id: input.account_id,
      pattern_type: "kinetiks_id.marcus_question_resonance",
      dimensions: {
        topic: input.topic_hint,
        intent: input.intent_hint,
        icp: input.icp_hint,
      },
      observation_key: `${input.thread_id}:${input.message_id}`,
      outcome_window_seconds: WINDOWS.marcus_followup_seconds,
    };
    await recordDeferredObservation(obs, admin);
  } catch (err) {
    captureEmissionError("recordMarcusTurnObservation", err, {
      account_id: input.account_id,
      thread_id: input.thread_id,
      message_id: input.message_id,
    });
  }
}

/**
 * Called when a NEW user message arrives in a thread. Closes the most
 * recent pending Marcus-resonance observation for that thread with
 * outcome=1 (follow-up observed). Idempotent: if there's nothing
 * pending, returns silently.
 */
export async function closeMarcusTurnObservationForThread(
  args: { account_id: string; thread_id: string; origin?: string },
  admin: SupabaseClient,
): Promise<void> {
  const patternsUrl = resolvePatternsUrl(args.origin);
  const internalSecret = resolveInternalSecret();
  if (!patternsUrl || !internalSecret) return;

  try {
    // Find the most recent pending observation whose key starts with
    // this thread_id. ILIKE keeps it simple — observation_key encoding
    // is `${thread_id}:${message_id}` so prefix-match is exact-enough.
    const { data, error } = await admin
      .from(PENDING_OBS_TABLE)
      .select("observation_key")
      .eq("account_id", args.account_id)
      .eq("pattern_type", "kinetiks_id.marcus_question_resonance")
      .eq("status", "pending")
      .like("observation_key", `${args.thread_id}:%`)
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return;

    await closeDeferredObservation(
      {
        account_id: args.account_id,
        pattern_type: "kinetiks_id.marcus_question_resonance",
        observation_key: data.observation_key as string,
        outcome_value: 1,
        outcome_direction: "higher_is_better",
        patternsUrl,
        internalSecret,
      },
      admin,
    );
  } catch (err) {
    captureEmissionError("closeMarcusTurnObservationForThread", err, {
      account_id: args.account_id,
      thread_id: args.thread_id,
    });
  }
}

// ─────────────────────────────────────────────
// 2. Oracle insight action rate
// ─────────────────────────────────────────────

export interface InsightDeliveryObservationInput {
  account_id: string;
  insight_id: string;
  insight_category: string;
  severity: string;
  urgency_hint: string;
}

/**
 * Called when an insight is stamped delivered (surfaced to the user).
 * Records a 7-day pending observation; outcome closes to 1 when the
 * user accepts an action linked to this insight, 0 when the window
 * expires without action.
 *
 * Note: the "user accepted an action linked to insight X" signal is
 * not yet wired into the approval system. v1 stubs the outcome via
 * the archivist sweep — every observation closes as expired with
 * outcome=0. Action-driven closes wire in a follow-up.
 */
export async function recordInsightDeliveryObservation(
  input: InsightDeliveryObservationInput,
  admin: SupabaseClient,
): Promise<void> {
  try {
    const obs: DeferredObservationInput = {
      account_id: input.account_id,
      pattern_type: "kinetiks_id.insight_action_rate",
      dimensions: {
        insight_category: input.insight_category,
        severity: input.severity,
        urgency: input.urgency_hint,
      },
      observation_key: input.insight_id,
      outcome_window_seconds: WINDOWS.insight_action_seconds,
    };
    await recordDeferredObservation(obs, admin);
  } catch (err) {
    captureEmissionError("recordInsightDeliveryObservation", err, {
      account_id: input.account_id,
      insight_id: input.insight_id,
    });
  }
}

// ─────────────────────────────────────────────
// 3. Onboarding question value (synchronous)
// ─────────────────────────────────────────────

export interface OnboardingQuestionValueInput {
  account_id: string;
  question_id: string;
  icp_hint: string;
  /**
   * The structural-value outcome. Caller computes from the
   * proposal evaluation; canonical mapping in v1:
   *   - validated answer accepted: +1.0
   *   - inferred answer accepted: +0.5
   *   - speculative answer accepted: 0.0
   *   - declined: -1.0
   * Z-score-ish; refines once a longer history exists.
   */
  outcome_z_score: number;
  origin?: string;
}

export async function emitOnboardingQuestionValue(
  input: OnboardingQuestionValueInput,
  admin: SupabaseClient,
): Promise<void> {
  const patternsUrl = resolvePatternsUrl(input.origin);
  const internalSecret = resolveInternalSecret();
  if (!patternsUrl || !internalSecret) return;

  try {
    const payload = {
      account_id: input.account_id,
      source_app: KINETIKS_ID_SOURCE_APP,
      pattern_type: "kinetiks_id.onboarding_question_value",
      dimensions: {
        question_id: input.question_id,
        icp: input.icp_hint,
      },
      outcome_metric: "context_value_delta_z",
      outcome_value: input.outcome_z_score,
      outcome_direction: "higher_is_better",
      baseline_value: null,
      sample_size: 1,
      variance: null,
      source_workflow_id: null,
      applies_to_icp: null,
      evidence_refs: [
        `onboarding:${input.account_id}:${input.question_id}:${Date.now()}`,
      ],
    };
    const response = await fetch(patternsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalSecret}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(ONBOARDING_EMIT_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      captureEmissionError(
        "emitOnboardingQuestionValue",
        new Error(`HTTP ${response.status}`),
        {
          account_id: input.account_id,
          question_id: input.question_id,
          http_status: response.status,
        },
      );
    }
  } catch (err) {
    captureEmissionError("emitOnboardingQuestionValue", err, {
      account_id: input.account_id,
      question_id: input.question_id,
    });
  }
  // The unused 'admin' parameter is retained in the signature so callers
  // pass it consistently; emitOnboardingQuestionValue may later switch
  // to admin-direct writes (skipping HTTP) if performance demands it.
  void admin;
}

// ─────────────────────────────────────────────
// 4. Connection value per source
// ─────────────────────────────────────────────
//
// Phase 1.7.1 — open/close contract for connection-evidence usefulness.
//
// Open (record):
//   The Marcus tool-decision path opens an observation after a
//   successful invocation of any tool whose ToolDescriptor declares a
//   `connection_provider`. The `request_id` is generated at dispatch
//   and is the observation_key.
//
// Close (outcome=1) — two paths:
//   1. `closeConnectionEvidenceObservation(request_id, ...)` — exact
//      match by request_id. Marcus engine fires this when the tool
//      observation is rendered into the evidence brief. The brief
//      inclusion is the deterministic event: the data fed into Sonnet's
//      reasoning context, by definition.
//   2. `closeMostRecentConnectionEvidenceForProvider(provider, ...)` —
//      fuzzy match by provider (and account). Oracle fires this when
//      an insight is written whose `source_app` matches a connection
//      provider with a recent open observation. Pattern mirrors
//      `closeMarcusTurnObservationForThread` above.
//
// Expired close (outcome=0): the archivist's deferred sweep, unchanged.

export interface ConnectionEvidenceObservationInput {
  account_id: string;
  provider: string;
  layer: string;
  query_class_hint: string;
  /** A request-unique key (e.g. a request id) so closes don't collide. */
  request_id: string;
}

/** Diagnostic marker for which close path fired. Telemetry only. */
export type ConnectionEvidenceCloseVia =
  | "marcus_brief_inclusion"
  | "oracle_insight_citation";

/**
 * Open a pending observation against
 * `kinetiks_id.connection_value_per_source`. Best-effort: errors are
 * captured via Sentry but never bubble — pattern emission must not
 * block the user-facing tool call.
 */
export async function recordConnectionEvidenceObservation(
  input: ConnectionEvidenceObservationInput,
  admin: SupabaseClient,
): Promise<void> {
  try {
    const obs: DeferredObservationInput = {
      account_id: input.account_id,
      pattern_type: "kinetiks_id.connection_value_per_source",
      dimensions: {
        provider: input.provider,
        layer_touched: input.layer,
        query_class: input.query_class_hint,
      },
      observation_key: input.request_id,
      outcome_window_seconds: WINDOWS.connection_value_seconds,
    };
    await recordDeferredObservation(obs, admin);
  } catch (err) {
    captureEmissionError("recordConnectionEvidenceObservation", err, {
      account_id: input.account_id,
      provider: input.provider,
      request_id: input.request_id,
    });
  }
}

/**
 * Close a pending observation by exact `request_id` match with
 * outcome=1. Idempotent: a missing pending row returns silently (the
 * archivist sweep may have already expired it, or another close path
 * won the race).
 */
export async function closeConnectionEvidenceObservation(
  args: {
    account_id: string;
    request_id: string;
    /** Telemetry only — which downstream code path triggered the close. */
    outcome_recorded_via: ConnectionEvidenceCloseVia;
    origin?: string;
  },
  admin: SupabaseClient,
): Promise<void> {
  const patternsUrl = resolvePatternsUrl(args.origin);
  const internalSecret = resolveInternalSecret();
  if (!patternsUrl || !internalSecret) return;

  try {
    await closeDeferredObservation(
      {
        account_id: args.account_id,
        pattern_type: "kinetiks_id.connection_value_per_source",
        observation_key: args.request_id,
        outcome_value: 1,
        outcome_direction: "higher_is_better",
        patternsUrl,
        internalSecret,
      },
      admin,
    );
  } catch (err) {
    captureEmissionError("closeConnectionEvidenceObservation", err, {
      account_id: args.account_id,
      request_id: args.request_id,
      outcome_recorded_via: args.outcome_recorded_via,
    });
  }
}

/**
 * Close the most recent pending observation matching
 * (account_id, provider) with outcome=1. Used by the Oracle insight
 * citation path where the Oracle doesn't have the original Marcus
 * `request_id` but knows which connection provider the insight's
 * evidence came from. Fuzzy match by provider dimension + window.
 *
 * Mirrors `closeMarcusTurnObservationForThread` — select the latest
 * pending row, then call `closeDeferredObservation` by observation_key.
 * No-op if nothing pending.
 */
export async function closeMostRecentConnectionEvidenceForProvider(
  args: {
    account_id: string;
    provider: string;
    outcome_recorded_via: ConnectionEvidenceCloseVia;
    origin?: string;
  },
  admin: SupabaseClient,
): Promise<void> {
  const patternsUrl = resolvePatternsUrl(args.origin);
  const internalSecret = resolveInternalSecret();
  if (!patternsUrl || !internalSecret) return;

  try {
    // Select the most recent pending row for this provider. We can't
    // .eq() into the dimensions jsonb cheaply via PostgREST, so filter
    // server-side via ->>provider on the jsonb shape.
    const { data, error } = await admin
      .from(PENDING_OBS_TABLE)
      .select("observation_key, dimensions")
      .eq("account_id", args.account_id)
      .eq("pattern_type", "kinetiks_id.connection_value_per_source")
      .eq("status", "pending")
      .filter("dimensions->>provider", "eq", args.provider)
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return;

    await closeDeferredObservation(
      {
        account_id: args.account_id,
        pattern_type: "kinetiks_id.connection_value_per_source",
        observation_key: data.observation_key as string,
        outcome_value: 1,
        outcome_direction: "higher_is_better",
        patternsUrl,
        internalSecret,
      },
      admin,
    );
  } catch (err) {
    captureEmissionError(
      "closeMostRecentConnectionEvidenceForProvider",
      err,
      {
        account_id: args.account_id,
        provider: args.provider,
        outcome_recorded_via: args.outcome_recorded_via,
      },
    );
  }
}
