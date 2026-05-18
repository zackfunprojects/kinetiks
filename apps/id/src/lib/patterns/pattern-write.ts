/**
 * Pattern arbitration write path per the Kinetiks Contract Addendum §1.4.
 *
 * L1b canonical shape: a Pattern row carries a SINGLE primary outcome
 * (outcome_metric + outcome_value + outcome_direction + baseline_value
 * + lift_ratio) and source_app (not emitting_app). Multi-outcome
 * insights are modeled as separate pattern types sharing fingerprint
 * dimensions.
 *
 * Per emission, the merge logic uses Welford's parallel algorithm to
 * combine two batches of outcome samples while updating running mean
 * (outcome_value) and variance:
 *
 *   delta = mean_b - mean_a
 *   mean_combined = mean_a + delta * (n_b / (n_a + n_b))
 *   M_a = variance_a * (n_a - 1)
 *   M_b = variance_b * (n_b - 1)
 *   M_combined = M_a + M_b + delta^2 * (n_a * n_b / (n_a + n_b))
 *   variance_combined = M_combined / (n_a + n_b - 1)
 *
 * sample_size is the sum of contributing samples. lift_ratio is
 * recomputed when baseline_value is present.
 */

import type {
  Pattern,
  PatternEmissionPayload,
  PatternEmissionResult,
  PatternLifecycleStatus,
  PatternTypeDescriptor,
} from "@kinetiks/types";
import { assertTransition } from "@kinetiks/lib/state-machines";
import { computeConfidenceScore } from "./confidence";

/** Cap on evidence_summary.last_n_ledger_ids. Mirrors the spec (§1.2). */
export const EVIDENCE_LEDGER_ID_CAP = 50;

/**
 * Minimal DB seam this module needs. apps/id passes a thin adapter
 * around the admin Supabase client; tests pass an in-memory fake.
 */
export interface PatternWriteDb {
  findByFingerprint(args: {
    account_id: string;
    pattern_type: string;
    fingerprint: string;
  }): Promise<Pattern | null>;

  insertPattern(row: Omit<Pattern, "id" | "created_at" | "updated_at"> & {
    id?: string;
  }): Promise<Pattern>;

  updatePatternEvidence(args: {
    id: string;
    outcome_value: number;
    sample_size: number;
    variance: number | null;
    baseline_value: number | null;
    lift_ratio: number | null;
    confidence_score: number;
    observation_count: number;
    last_observed_at: string;
    decay_at: string;
    evidence_summary: Pattern["evidence_summary"];
  }): Promise<Pattern>;

  updatePatternStatus(args: {
    id: string;
    status: PatternLifecycleStatus;
  }): Promise<Pattern>;

  insertLedgerEntry(args: {
    account_id: string;
    event_type: string;
    source_app: string | null;
    source_operator: string | null;
    detail: Record<string, unknown>;
  }): Promise<void>;
}

export interface PatternWriteInput {
  account_id: string;
  /** The originating app (matches descriptor.source_app per canonical). */
  source_app: string;
  descriptor: PatternTypeDescriptor;
  /** The bucketized dimensions (after descriptor.bucketize, before write). */
  bucketized_dimensions: Record<string, unknown>;
  fingerprint: string;
  payload: PatternEmissionPayload;
  /** "now" for testability. Defaults to current Date when omitted. */
  now?: Date;
}

// ============================================================
// Idempotency check
// ============================================================

export function isFullyCoveredByExistingEvidence(
  payload_refs: readonly string[],
  existing_last_n: readonly string[],
): boolean {
  if (payload_refs.length === 0) return false;
  const known = new Set(existing_last_n);
  return payload_refs.every((id) => known.has(id));
}

// ============================================================
// Welford parallel-merge of two batches
// ============================================================

export interface OutcomeStats {
  mean: number;
  variance: number;
  count: number;
}

/**
 * Combine batch A (existing pattern state) with batch B (incoming
 * payload). Returns the merged mean + variance + count.
 *
 * Inputs may have count <= 1 (variance undefined); the function falls
 * back to a simple weighted mean when stable variance can't be merged.
 */
export function mergeOutcomeStats(a: OutcomeStats, b: OutcomeStats): OutcomeStats {
  const n_total = a.count + b.count;
  if (n_total <= 0) {
    return { mean: 0, variance: 0, count: 0 };
  }
  if (a.count === 0) return { ...b };
  if (b.count === 0) return { ...a };
  const delta = b.mean - a.mean;
  const mean_combined = a.mean + delta * (b.count / n_total);
  // Welford parallel-merge: combine the M2 (sum-of-squared-deviations) terms.
  // M = variance * (n - 1). When n <= 1, treat M as 0 (no variance signal).
  const Ma = a.count > 1 ? a.variance * (a.count - 1) : 0;
  const Mb = b.count > 1 ? b.variance * (b.count - 1) : 0;
  const M_combined =
    Ma + Mb + (delta * delta * a.count * b.count) / n_total;
  const variance_combined =
    n_total > 1 ? M_combined / (n_total - 1) : 0;
  return { mean: mean_combined, variance: variance_combined, count: n_total };
}

// ============================================================
// Evidence summary update
// ============================================================

function buildEvidenceSummary(args: {
  prior: Pattern["evidence_summary"] | undefined;
  new_ledger_ids: string[];
  total_evidence_count: number;
  period_days: number;
}): Pattern["evidence_summary"] {
  const priorIds = args.prior?.last_n_ledger_ids ?? [];
  const seen = new Set(priorIds);
  const merged = [...priorIds];
  for (const id of args.new_ledger_ids) {
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  }
  const capped = merged.slice(-EVIDENCE_LEDGER_ID_CAP);
  return {
    last_n_ledger_ids: capped,
    summary: {
      total_evidence_count: args.total_evidence_count,
      period_days: args.period_days,
    },
  };
}

// ============================================================
// Lift ratio derivation
// ============================================================

function deriveLiftRatio(
  outcome_value: number,
  baseline_value: number | null,
): number | null {
  if (baseline_value === null || baseline_value === 0) return null;
  return outcome_value / baseline_value;
}

// ============================================================
// Arbitration pipeline
// ============================================================

export async function writePatternEmission(
  input: PatternWriteInput,
  db: PatternWriteDb,
): Promise<PatternEmissionResult> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  const existing = await db.findByFingerprint({
    account_id: input.account_id,
    pattern_type: input.payload.pattern_type,
    fingerprint: input.fingerprint,
  });

  if (
    existing &&
    isFullyCoveredByExistingEvidence(
      input.payload.evidence_refs,
      existing.evidence_summary?.last_n_ledger_ids ?? [],
    )
  ) {
    return {
      outcome: "duplicate_ignored",
      pattern_id: existing.id,
      reason: "evidence_refs_covered",
    };
  }

  const priorIds = new Set(existing?.evidence_summary?.last_n_ledger_ids ?? []);
  const newDistinctRefs = input.payload.evidence_refs.filter(
    (id) => !priorIds.has(id),
  );

  if (!existing) {
    // ── New pattern: create ───────────────────────────────────
    const observationCount = newDistinctRefs.length || 1;
    const sampleSize = Math.max(0, input.payload.sample_size);
    const variance = input.payload.variance ?? null;
    const baselineValue = input.payload.baseline_value ?? null;
    const liftRatio = deriveLiftRatio(input.payload.outcome_value, baselineValue);

    const confidenceScore = computeConfidenceScore({
      observation_count: observationCount,
      days_since_last_observation: 0,
      effective_decay_days: input.descriptor.decay_bounds.initial_decay_days,
      primary_metric_values: [input.payload.outcome_value],
    });

    const decayAt = new Date(
      now.getTime() +
        input.descriptor.decay_bounds.initial_decay_days * 24 * 60 * 60 * 1000,
    ).toISOString();

    const inserted = await db.insertPattern({
      account_id: input.account_id,
      team_scope_id: null,
      source_app: input.source_app,
      source_workflow_id: input.payload.source_workflow_id ?? null,
      pattern_type: input.payload.pattern_type,
      applies_to_icp: input.payload.applies_to_icp ?? null,
      fingerprint: input.fingerprint,
      outcome_metric: input.payload.outcome_metric,
      outcome_value: input.payload.outcome_value,
      outcome_direction: input.payload.outcome_direction,
      baseline_value: baselineValue,
      lift_ratio: liftRatio,
      sample_size: sampleSize,
      observation_count: observationCount,
      confidence_score: confidenceScore,
      variance,
      status: "emerging",
      first_observed_at: nowIso,
      last_observed_at: nowIso,
      effective_decay_days: input.descriptor.decay_bounds.initial_decay_days,
      decay_at: decayAt,
      validated_at: null,
      declining_at: null,
      archived_at: null,
      imported: false,
      imported_from: null,
      user_starred: false,
      user_suppressed: false,
      user_annotation: null,
      dimensions: input.bucketized_dimensions,
      evidence_summary: buildEvidenceSummary({
        prior: undefined,
        new_ledger_ids: input.payload.evidence_refs,
        total_evidence_count: observationCount,
        period_days: 0,
      }),
    });

    await db.insertLedgerEntry({
      account_id: input.account_id,
      event_type: "pattern_observed",
      source_app: input.source_app,
      source_operator: "archivist",
      detail: {
        pattern_id: inserted.id,
        pattern_type: inserted.pattern_type,
        outcome: "created_emerging",
        evidence_refs: input.payload.evidence_refs,
        outcome_snapshot: {
          metric: input.payload.outcome_metric,
          value: input.payload.outcome_value,
          lift_ratio: liftRatio,
        },
        sample_size_after: sampleSize,
        confidence_score_after: confidenceScore,
      },
    });

    return {
      outcome: "created_emerging",
      pattern_id: inserted.id,
      status: "emerging",
      confidence_score: confidenceScore,
      observation_count: observationCount,
      sample_size: sampleSize,
      lift_ratio: liftRatio,
    };
  }

  // ── Existing pattern: merge via Welford ──────────────────────
  const merged = mergeOutcomeStats(
    {
      mean: existing.outcome_value,
      variance: existing.variance ?? 0,
      count: existing.sample_size,
    },
    {
      mean: input.payload.outcome_value,
      variance: input.payload.variance ?? 0,
      count: input.payload.sample_size,
    },
  );
  // Baseline is set on first emission; subsequent emissions may carry
  // a fresher baseline, in which case we prefer the new one (the
  // emitter knows the current baseline best).
  const mergedBaseline =
    (input.payload.baseline_value ?? null) !== null
      ? input.payload.baseline_value!
      : existing.baseline_value;
  const mergedLift = deriveLiftRatio(merged.mean, mergedBaseline);

  const observationCountDelta = newDistinctRefs.length;
  const newObservationCount =
    existing.observation_count + observationCountDelta;

  // Stability term in the confidence formula uses outcome samples; we
  // approximate by repeating the merged mean across the observation
  // count, which yields zero stability variance — Phase 1 simplification
  // matching the L1a behavior. Phase 2 may track a sample reservoir.
  const primaryValuesForStability = Array(
    Math.min(newObservationCount, EVIDENCE_LEDGER_ID_CAP),
  ).fill(merged.mean);

  const decayInterval = existing.effective_decay_days * 24 * 60 * 60 * 1000;
  const newDecayAt = new Date(now.getTime() + decayInterval).toISOString();

  const newConfidence = computeConfidenceScore({
    observation_count: newObservationCount,
    days_since_last_observation: 0,
    effective_decay_days: existing.effective_decay_days,
    primary_metric_values: primaryValuesForStability,
  });

  const evidenceSummary = buildEvidenceSummary({
    prior: existing.evidence_summary,
    new_ledger_ids: input.payload.evidence_refs,
    total_evidence_count: newObservationCount,
    period_days: Math.max(
      0,
      Math.floor(
        (now.getTime() - new Date(existing.first_observed_at).getTime()) /
          (24 * 60 * 60 * 1000),
      ),
    ),
  });

  await db.updatePatternEvidence({
    id: existing.id,
    outcome_value: merged.mean,
    sample_size: merged.count,
    variance: merged.count > 1 ? merged.variance : null,
    baseline_value: mergedBaseline,
    lift_ratio: mergedLift,
    confidence_score: newConfidence,
    observation_count: newObservationCount,
    last_observed_at: nowIso,
    decay_at: newDecayAt,
    evidence_summary: evidenceSummary,
  });

  await db.insertLedgerEntry({
    account_id: input.account_id,
    event_type: "pattern_observed",
    source_app: input.source_app,
    source_operator: "archivist",
    detail: {
      pattern_id: existing.id,
      pattern_type: existing.pattern_type,
      outcome: "evidence_added",
      evidence_refs: input.payload.evidence_refs,
      outcome_snapshot: {
        metric: existing.outcome_metric,
        value: merged.mean,
        lift_ratio: mergedLift,
      },
      observation_count_after: newObservationCount,
      sample_size_after: merged.count,
      confidence_score_after: newConfidence,
    },
  });

  // ── Apply state machine transitions ──
  const thresholds = input.descriptor.confidence_thresholds;
  let nextStatus: PatternLifecycleStatus = existing.status;
  let transitionedFrom: "emerging" | "validated" | "declining" | undefined;

  if (existing.status === "emerging" && newConfidence >= thresholds.validate_at) {
    nextStatus = "validated";
    transitionedFrom = "emerging";
  } else if (
    existing.status === "declining" &&
    newConfidence >= thresholds.validate_at
  ) {
    nextStatus = "validated";
    transitionedFrom = "declining";
  } else if (
    existing.status === "validated" &&
    newConfidence <= thresholds.decline_at
  ) {
    nextStatus = "declining";
    transitionedFrom = "validated";
  }

  if (nextStatus !== existing.status) {
    assertTransition({
      entity: "kinetiks_pattern_library",
      from: existing.status,
      to: nextStatus,
      actor: { kind: "agent", operatorKey: "archivist", accountId: input.account_id },
    });
    await db.updatePatternStatus({ id: existing.id, status: nextStatus });
    await db.insertLedgerEntry({
      account_id: input.account_id,
      event_type: "pattern_arbitrated",
      source_app: input.source_app,
      source_operator: "archivist",
      detail: {
        pattern_id: existing.id,
        pattern_type: existing.pattern_type,
        from: existing.status,
        to: nextStatus,
        reason: "confidence_threshold",
        confidence_score: newConfidence,
      },
    });

    if (
      nextStatus === "validated" &&
      (transitionedFrom === "emerging" || transitionedFrom === "declining")
    ) {
      return {
        outcome: "promoted",
        pattern_id: existing.id,
        status: "validated",
        confidence_score: newConfidence,
        observation_count: newObservationCount,
        sample_size: merged.count,
        lift_ratio: mergedLift,
        transitioned_from: transitionedFrom,
      };
    }
    if (nextStatus === "declining" && transitionedFrom === "validated") {
      return {
        outcome: "demoted",
        pattern_id: existing.id,
        status: "declining",
        confidence_score: newConfidence,
        observation_count: newObservationCount,
        sample_size: merged.count,
        lift_ratio: mergedLift,
        transitioned_from: "validated",
      };
    }
  }

  return {
    outcome: "evidence_added",
    pattern_id: existing.id,
    status: existing.status,
    confidence_score: newConfidence,
    observation_count: newObservationCount,
    sample_size: merged.count,
    lift_ratio: mergedLift,
  };
}
