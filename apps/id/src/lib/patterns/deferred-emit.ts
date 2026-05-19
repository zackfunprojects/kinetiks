/**
 * Deferred-emit helper for kinetiks_id.* pattern types whose outcome
 * value is only known after a delay window (Phase 1.7).
 *
 * Three call paths:
 *
 *   1. recordDeferredObservation()
 *      Called at observation time (Marcus turn completes, Oracle insight
 *      delivered, connection evidence aggregated). Writes a pending row
 *      to kinetiks_pattern_pending_observations with dimensions + an
 *      outcome_window_expires_at timestamp.
 *
 *   2. closeDeferredObservation()
 *      Called when the outcome arrives (user follows up, accepts the
 *      action, etc.). Looks up the pending row by
 *      (account_id, pattern_type, observation_key), sets the outcome,
 *      flips status to 'closed', and POSTs an emission to
 *      /api/synapse/patterns with outcome_value + sample_size=1.
 *
 *   3. sweepExpiredDeferredObservations()
 *      Called by /api/archivist/patterns/sweep-deferred (which the
 *      archivist-cron POSTs to). For every still-pending row whose
 *      outcome_window_expires_at < now(), flips to 'expired' and emits
 *      with outcome_value=0 (or a caller-provided expired-default).
 *
 * All three paths route through /api/synapse/patterns so the same
 * arbitration code path real apps use also fires here. No bypass.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PatternEmissionPayload, PatternOutcomeDirection } from "@kinetiks/types";

type SupabaseAdmin = SupabaseClient;

/** What recordDeferredObservation needs from the caller. */
export interface DeferredObservationInput {
  account_id: string;
  pattern_type: string;
  dimensions: Record<string, unknown>;
  /**
   * Caller-chosen correlation key. Must be unique per
   * (account_id, pattern_type) — typically a thread_id, insight_id, or
   * connection_evidence_request_id. The close path looks it up to
   * resolve the pending row.
   */
  observation_key: string;
  outcome_window_seconds: number;
}

export interface DeferredObservationRow {
  id: string;
  account_id: string;
  pattern_type: string;
  dimensions: Record<string, unknown>;
  observation_key: string;
  observed_at: string;
  outcome_window_expires_at: string;
  status: "pending" | "closed" | "expired";
}

const PENDING_OBS_TABLE = "kinetiks_pattern_pending_observations" as const;

/** Insert a new pending observation. Returns the row id. */
export async function recordDeferredObservation(
  input: DeferredObservationInput,
  admin: SupabaseAdmin,
): Promise<{ id: string }> {
  const expiresAt = new Date(
    Date.now() + input.outcome_window_seconds * 1000,
  ).toISOString();
  const { data, error } = await admin
    .from(PENDING_OBS_TABLE)
    .insert({
      account_id: input.account_id,
      pattern_type: input.pattern_type,
      dimensions: input.dimensions,
      observation_key: input.observation_key,
      outcome_window_expires_at: expiresAt,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(
      `recordDeferredObservation failed (account=${input.account_id}, type=${input.pattern_type}): ${error.message}`,
    );
  }
  return { id: data.id as string };
}

export interface CloseDeferredArgs {
  account_id: string;
  pattern_type: string;
  observation_key: string;
  /** The realized outcome value. Typically 0 or 1 for ratio metrics. */
  outcome_value: number;
  outcome_direction: PatternOutcomeDirection;
  patternsUrl: string;
  internalSecret: string;
}

export interface CloseResult {
  closed: boolean;
  pattern_id: string | null;
  outcome: string | null;
  /** Why close was a no-op when closed===false. */
  reason: string | null;
}

/**
 * Close the pending observation that matches
 * (account_id, pattern_type, observation_key), set its outcome, and
 * emit through /api/synapse/patterns. Idempotent: if no pending row
 * exists (already closed or expired), returns closed=false silently.
 */
export async function closeDeferredObservation(
  args: CloseDeferredArgs,
  admin: SupabaseAdmin,
): Promise<CloseResult> {
  const { data: pending, error: selectError } = await admin
    .from(PENDING_OBS_TABLE)
    .select("id, dimensions")
    .eq("account_id", args.account_id)
    .eq("pattern_type", args.pattern_type)
    .eq("observation_key", args.observation_key)
    .eq("status", "pending")
    .maybeSingle();
  if (selectError) {
    return {
      closed: false,
      pattern_id: null,
      outcome: null,
      reason: `select_failed: ${selectError.message}`,
    };
  }
  if (!pending) {
    return {
      closed: false,
      pattern_id: null,
      outcome: null,
      reason: "no_pending_observation",
    };
  }

  // Flip status to closed BEFORE emitting so a slow synapse POST can't
  // cause a duplicate emission on retry.
  const { error: updateError } = await admin
    .from(PENDING_OBS_TABLE)
    .update({
      status: "closed",
      closed_outcome_value: args.outcome_value,
      closed_at: new Date().toISOString(),
    })
    .eq("id", pending.id);
  if (updateError) {
    return {
      closed: false,
      pattern_id: null,
      outcome: null,
      reason: `update_failed: ${updateError.message}`,
    };
  }

  const emit = await emitPattern({
    account_id: args.account_id,
    pattern_type: args.pattern_type,
    dimensions: pending.dimensions as Record<string, unknown>,
    outcome_value: args.outcome_value,
    outcome_direction: args.outcome_direction,
    observation_id: pending.id as string,
    patternsUrl: args.patternsUrl,
    internalSecret: args.internalSecret,
  });

  return {
    closed: true,
    pattern_id: emit.pattern_id,
    outcome: emit.outcome,
    reason: null,
  };
}

export interface SweepDeferredArgs {
  patternsUrl: string;
  internalSecret: string;
  /** Maximum rows to process per sweep tick. Defaults to 500. */
  limit?: number;
  /** Limit the sweep to one account (for the archivist per-account batching). */
  account_id?: string;
  /**
   * Outcome value to emit when the window expired without an explicit
   * close. Defaults to 0 — the "user did not follow up / did not act"
   * baseline. Connection evidence usefulness is a special case (see
   * Phase 1.7 plan) and may want a different default in the future.
   */
  expiredOutcomeValue?: number;
  expiredOutcomeDirection?: PatternOutcomeDirection;
}

export interface SweepDeferredResult {
  scanned: number;
  expired_count: number;
  emitted_count: number;
  failed_count: number;
}

/**
 * Find pending observations whose window has expired and close them
 * with the expired-default outcome. Each emits through
 * /api/synapse/patterns. Bounded to `limit` rows per tick to keep
 * runs predictable.
 */
export async function sweepExpiredDeferredObservations(
  args: SweepDeferredArgs,
  admin: SupabaseAdmin,
): Promise<SweepDeferredResult> {
  const limit = args.limit ?? 500;
  const outcomeValue = args.expiredOutcomeValue ?? 0;
  const outcomeDirection = args.expiredOutcomeDirection ?? "higher_is_better";

  let query = admin
    .from(PENDING_OBS_TABLE)
    .select("id, account_id, pattern_type, dimensions")
    .eq("status", "pending")
    .lt("outcome_window_expires_at", new Date().toISOString())
    .order("outcome_window_expires_at", { ascending: true })
    .limit(limit);
  if (args.account_id) {
    query = query.eq("account_id", args.account_id);
  }
  const { data: rows, error } = await query;
  if (error) {
    throw new Error(`sweepExpiredDeferredObservations select failed: ${error.message}`);
  }
  if (!rows || rows.length === 0) {
    return { scanned: 0, expired_count: 0, emitted_count: 0, failed_count: 0 };
  }

  let emitted = 0;
  let failed = 0;
  for (const row of rows) {
    // Flip first so a slow synapse POST doesn't cause a duplicate.
    const { error: updateError } = await admin
      .from(PENDING_OBS_TABLE)
      .update({
        status: "expired",
        closed_outcome_value: outcomeValue,
        closed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updateError) {
      failed++;
      continue;
    }

    try {
      const emit = await emitPattern({
        account_id: row.account_id as string,
        pattern_type: row.pattern_type as string,
        dimensions: row.dimensions as Record<string, unknown>,
        outcome_value: outcomeValue,
        outcome_direction: outcomeDirection,
        observation_id: row.id as string,
        patternsUrl: args.patternsUrl,
        internalSecret: args.internalSecret,
      });
      if (emit.ok) emitted++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return {
    scanned: rows.length,
    expired_count: rows.length,
    emitted_count: emitted,
    failed_count: failed,
  };
}

// ─────────────────────────────────────────────
// Internal: emit a pattern via /api/synapse/patterns
// ─────────────────────────────────────────────

interface EmitPatternArgs {
  account_id: string;
  pattern_type: string;
  dimensions: Record<string, unknown>;
  outcome_value: number;
  outcome_direction: PatternOutcomeDirection;
  /** The pending-observations row id; used as evidence_refs marker. */
  observation_id: string;
  patternsUrl: string;
  internalSecret: string;
}

interface SynapseSuccess {
  data?: { outcome?: string; pattern_id?: string; reason?: string };
}

async function emitPattern(args: EmitPatternArgs): Promise<{
  ok: boolean;
  outcome: string | null;
  pattern_id: string | null;
}> {
  // outcome_metric is determined by the pattern_type's descriptor; the
  // synapse endpoint validates outcome_metric matches the descriptor.
  // We resolve it via getPatternType so the caller doesn't have to.
  const { getPatternType } = await import("@kinetiks/tools");
  const descriptor = getPatternType(args.pattern_type);
  if (!descriptor) {
    return { ok: false, outcome: "unregistered_type", pattern_id: null };
  }

  const payload: PatternEmissionPayload & { account_id: string; source_app: string } = {
    account_id: args.account_id,
    source_app: "kinetiks_id",
    pattern_type: args.pattern_type,
    dimensions: args.dimensions,
    outcome_metric: descriptor.outcome_metric,
    outcome_value: args.outcome_value,
    outcome_direction: args.outcome_direction,
    baseline_value: null,
    sample_size: 1,
    variance: null,
    source_workflow_id: null,
    applies_to_icp: null,
    evidence_refs: [`deferred:${args.observation_id}`],
  };

  try {
    const response = await fetch(args.patternsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.internalSecret}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return { ok: false, outcome: `http_${response.status}`, pattern_id: null };
    }
    const json = (await response.json()) as SynapseSuccess;
    const outcome = json.data?.outcome ?? "unknown";
    const success =
      outcome === "created_emerging" ||
      outcome === "evidence_added" ||
      outcome === "promoted" ||
      outcome === "demoted" ||
      outcome === "duplicate_ignored";
    return {
      ok: success,
      outcome,
      pattern_id: json.data?.pattern_id ?? null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return { ok: false, outcome: `fetch_error:${message}`, pattern_id: null };
  }
}
