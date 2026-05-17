/**
 * Pattern arbitration write path per the 2027 addendum §1.4.
 *
 * The Archivist is the canonical writer of `kinetiks_pattern_library`.
 * This module is the synchronous arbitration pipeline invoked by the
 * Synapse emission endpoint at /api/synapse/patterns and (later) by the
 * periodic re-evaluation sweep added to archivist-cron.
 *
 * Algorithm per §1.4:
 *   1. Caller has already authenticated, resolved account, verified
 *      synapse active, looked up the descriptor, validated emitting_app,
 *      validated bucketized dimensions against descriptor.dimensions_schema,
 *      validated outcome_metric names and units, and computed the
 *      fingerprint.
 *   2. This module looks up any existing pattern by (account_id,
 *      pattern_type, fingerprint).
 *   3. Idempotency: if every evidence_ref in the payload is already in
 *      existing.evidence_summary.last_n_ledger_ids, return
 *      duplicate_ignored.
 *   4. If no existing: insert with initial confidence + decay; return
 *      created_emerging.
 *   5. If existing: merge outcome metrics (running average weighted by
 *      sample_count), increment observation_count by the count of NEW
 *      distinct evidence refs, bump last_observed_at, extend decay_at,
 *      recompute confidence_score. Return evidence_added.
 *   6. Apply state machine transitions per §1.7. If confidence_score
 *      crossed validate_at and current status is emerging, transition
 *      to validated; return promoted. If confidence_score fell below
 *      decline_at and current status is validated, transition to
 *      declining; return demoted.
 *   7. Every step writes the relevant Ledger entries (pattern_observed,
 *      pattern_arbitrated) with pattern_id attached.
 *
 * The DB seam is parameterized so unit tests can supply an in-memory
 * fake without spinning up Postgres. Production callers pass the
 * service-role admin client.
 */

import type {
  Pattern,
  PatternEmissionPayload,
  PatternEmissionResult,
  PatternLifecycleStatus,
  PatternOutcomeMetric,
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
  /** Read the row at (account_id, pattern_type, fingerprint) or null. */
  findByFingerprint(args: {
    account_id: string;
    pattern_type: string;
    fingerprint: string;
  }): Promise<Pattern | null>;

  /** Insert a new pattern row; returns the inserted row. */
  insertPattern(row: Omit<Pattern, "id" | "created_at" | "updated_at"> & {
    id?: string;
  }): Promise<Pattern>;

  /**
   * Update non-status fields on the row (merge outcome, append evidence,
   * recompute confidence, bump last_observed_at and decay_at). Returns
   * the updated row.
   */
  updatePatternEvidence(args: {
    id: string;
    confidence_score: number;
    observation_count: number;
    last_observed_at: string;
    decay_at: string;
    outcome_metrics: PatternOutcomeMetric[];
    evidence_summary: Pattern["evidence_summary"];
  }): Promise<Pattern>;

  /** Update only the lifecycle status column (trigger stamps timestamps). */
  updatePatternStatus(args: {
    id: string;
    status: PatternLifecycleStatus;
  }): Promise<Pattern>;

  /** Append a Ledger entry. */
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
  emitting_app: string;
  descriptor: PatternTypeDescriptor;
  /** The bucketized dimensions (after descriptor.bucketize, before write). */
  bucketized_dimensions: Record<string, unknown>;
  fingerprint: string;
  payload: PatternEmissionPayload;
  /**
   * "now" for testability. Defaults to Date.now() when omitted at call
   * time; tests pin a value.
   */
  now?: Date;
}

// ============================================================
// Outcome metric merge (running average weighted by sample_count)
// ============================================================

export function mergeOutcomeMetrics(
  existing: PatternOutcomeMetric[],
  incoming: PatternOutcomeMetric[],
): PatternOutcomeMetric[] {
  const out = new Map<string, PatternOutcomeMetric>();
  for (const m of existing) {
    out.set(m.metric_name, { ...m });
  }
  for (const inc of incoming) {
    const prev = out.get(inc.metric_name);
    if (!prev) {
      out.set(inc.metric_name, { ...inc });
      continue;
    }
    const totalSamples = prev.sample_count + inc.sample_count;
    if (totalSamples <= 0) {
      out.set(inc.metric_name, { ...inc });
      continue;
    }
    const mergedValue =
      (prev.value * prev.sample_count + inc.value * inc.sample_count) /
      totalSamples;
    // Per-metric confidence: weighted average by sample_count, the same
    // way the value is merged. This is a Phase 1 simplification; Phase 2
    // may use a Bayesian update.
    const mergedConfidence =
      (prev.confidence * prev.sample_count + inc.confidence * inc.sample_count) /
      totalSamples;
    out.set(inc.metric_name, {
      metric_name: inc.metric_name,
      value: mergedValue,
      sample_count: totalSamples,
      confidence: mergedConfidence,
      unit: inc.unit, // unit is validated against descriptor at the endpoint layer
    });
  }
  return Array.from(out.values());
}

// ============================================================
// Evidence summary update
// ============================================================

function buildEvidenceSummary(args: {
  prior: Pattern["evidence_summary"] | undefined;
  new_ledger_ids: string[];
  total_evidence_count: number;
  period_days: number;
  primary_metric: PatternOutcomeMetric | undefined;
}): Pattern["evidence_summary"] {
  const priorIds = args.prior?.last_n_ledger_ids ?? [];
  // Dedup-and-append, then cap to EVIDENCE_LEDGER_ID_CAP, keeping the most recent.
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
      primary_metric: args.primary_metric?.metric_name ?? "",
      primary_metric_value: args.primary_metric?.value ?? 0,
    },
  };
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

  // Distinct new evidence refs (not already in the prior summary).
  const priorIds = new Set(existing?.evidence_summary?.last_n_ledger_ids ?? []);
  const newDistinctRefs = input.payload.evidence_refs.filter(
    (id) => !priorIds.has(id),
  );

  // Primary metric is the FIRST entry in descriptor.valid_outcome_metrics
  // by convention (§1.6).
  const primaryMetricName = input.descriptor.valid_outcome_metrics[0]?.name;

  if (!existing) {
    // ── New pattern: create with initial confidence + decay ──
    const observationCount = newDistinctRefs.length || 1;
    const primaryFromPayload = primaryMetricName
      ? input.payload.outcome_metrics.find(
          (m) => m.metric_name === primaryMetricName,
        )
      : undefined;
    const primaryValues = primaryFromPayload
      ? [primaryFromPayload.value]
      : [];

    const confidenceScore = computeConfidenceScore({
      observation_count: observationCount,
      days_since_last_observation: 0,
      effective_decay_days: input.descriptor.decay_bounds.initial_decay_days,
      primary_metric_values: primaryValues,
    });

    const decayAt = new Date(
      now.getTime() +
        input.descriptor.decay_bounds.initial_decay_days * 24 * 60 * 60 * 1000,
    ).toISOString();

    const inserted = await db.insertPattern({
      account_id: input.account_id,
      team_scope_id: null,
      pattern_type: input.payload.pattern_type,
      emitting_app: input.emitting_app,
      applies_to_icp: input.payload.applies_to_icp ?? null,
      fingerprint: input.fingerprint,
      status: "emerging",
      confidence_score: confidenceScore,
      observation_count: observationCount,
      first_observed_at: nowIso,
      last_observed_at: nowIso,
      effective_decay_days: input.descriptor.decay_bounds.initial_decay_days,
      decay_at: decayAt,
      validated_at: null,
      declining_at: null,
      archived_at: null,
      user_starred: false,
      user_suppressed: false,
      user_annotation: null,
      dimensions: input.bucketized_dimensions,
      outcome_metrics: input.payload.outcome_metrics,
      evidence_summary: buildEvidenceSummary({
        prior: undefined,
        new_ledger_ids: input.payload.evidence_refs,
        total_evidence_count: observationCount,
        period_days: 0,
        primary_metric: primaryFromPayload,
      }),
    });

    await db.insertLedgerEntry({
      account_id: input.account_id,
      event_type: "pattern_observed",
      source_app: input.emitting_app,
      source_operator: "archivist",
      detail: {
        pattern_id: inserted.id,
        pattern_type: inserted.pattern_type,
        outcome: "created_emerging",
        evidence_refs: input.payload.evidence_refs,
        outcome_metrics_snapshot: input.payload.outcome_metrics,
      },
    });

    return {
      outcome: "created_emerging",
      pattern_id: inserted.id,
      status: "emerging",
      confidence_score: confidenceScore,
      observation_count: observationCount,
    };
  }

  // ── Existing pattern: merge ──
  const observationCountDelta = newDistinctRefs.length;
  const newObservationCount =
    existing.observation_count + observationCountDelta;
  const mergedMetrics = mergeOutcomeMetrics(
    existing.outcome_metrics,
    input.payload.outcome_metrics,
  );
  const primaryMerged = primaryMetricName
    ? mergedMetrics.find((m) => m.metric_name === primaryMetricName)
    : undefined;
  // Build a primary_metric_values series from the cap-50 evidence: we
  // don't have per-event historical values stored, so approximate using
  // the merged primary value repeated for newObservationCount. This is
  // a Phase 1 simplification — stability is computed from the rolled-up
  // current state, not from per-event series — and matches the spec's
  // bounded-history footprint. Phase 2 may track per-event metrics.
  const primaryValuesForStability = primaryMerged
    ? Array(Math.min(newObservationCount, EVIDENCE_LEDGER_ID_CAP)).fill(
        primaryMerged.value,
      )
    : [];

  const decayInterval =
    existing.effective_decay_days * 24 * 60 * 60 * 1000;
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
    primary_metric: primaryMerged,
  });

  await db.updatePatternEvidence({
    id: existing.id,
    confidence_score: newConfidence,
    observation_count: newObservationCount,
    last_observed_at: nowIso,
    decay_at: newDecayAt,
    outcome_metrics: mergedMetrics,
    evidence_summary: evidenceSummary,
  });

  await db.insertLedgerEntry({
    account_id: input.account_id,
    event_type: "pattern_observed",
    source_app: input.emitting_app,
    source_operator: "archivist",
    detail: {
      pattern_id: existing.id,
      pattern_type: existing.pattern_type,
      outcome: "evidence_added",
      evidence_refs: input.payload.evidence_refs,
      observation_count_after: newObservationCount,
      confidence_score_after: newConfidence,
    },
  });

  // ── Apply state machine transitions ──
  const thresholds = input.descriptor.confidence_thresholds;
  let nextStatus: PatternLifecycleStatus = existing.status;
  let transitionedFrom: "emerging" | "validated" | "declining" | undefined;

  if (
    existing.status === "emerging" &&
    newConfidence >= thresholds.validate_at
  ) {
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
      source_app: input.emitting_app,
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
  };
}
