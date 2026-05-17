/**
 * Pattern Library types per the Kinetiks Contract Addendum §1.
 *
 * The `Pattern` shape mirrors a `kinetiks_pattern_library` row as
 * surfaced through the read path. The emission/result types are the
 * Synapse contract between an emitting suite app and the Archivist
 * write path in apps/id.
 *
 * Per CLAUDE.md, these are append-only contracts. Breaking changes
 * require a documented platform-contract version bump (and an export
 * `schema_version` bump for the import/export endpoints).
 */

// ============================================================
// Lifecycle status
// ============================================================

/**
 * Pattern lifecycle per Kinetiks Contract Addendum §1.6 (Lifecycle and Empirical Decay Calibration).
 *
 * Legal transitions (Archivist-driven, sole writer):
 *   emerging  → validated | archived
 *   validated → declining | archived
 *   declining → validated | archived
 *
 * `archived` is terminal. User-starred patterns are exempt from
 * automatic archive but can still be manually archived by the customer.
 */
export type PatternLifecycleStatus =
  | "emerging"
  | "validated"
  | "declining"
  | "archived";

// ============================================================
// Outcome metric (runtime shape, distinct from descriptor)
// ============================================================

/**
 * A single outcome metric observation stored on the pattern row. The
 * `metric_name` and `unit` must match an entry in the descriptor's
 * `valid_outcome_metrics`; mismatches are rejected at emission time.
 */
export interface PatternOutcomeMetric {
  metric_name: string;
  value: number;
  /** Sample size backing this metric value; contributes to confidence. */
  sample_count: number;
  /** [0,1] per-metric confidence, not the pattern-level confidence_score. */
  confidence: number;
  /** Must match the descriptor's declared unit string exactly. */
  unit: string;
}

// ============================================================
// Evidence summary (rolling, capped)
// ============================================================

/**
 * The rolling evidence summary stored on the pattern row. Keeps the
 * last N Ledger entry IDs (cap 50) plus a small summary block.
 * Detailed evidence lives in the Learning Ledger; this is the
 * pointer back to it.
 */
export interface PatternEvidenceSummary {
  last_n_ledger_ids: string[];
  summary: {
    total_evidence_count: number;
    period_days: number;
    primary_metric: string;
    primary_metric_value: number;
  };
}

// ============================================================
// Pattern row (read shape)
// ============================================================

/**
 * The shape returned by `apps/id/src/lib/cortex/patterns/list.ts`,
 * `query_patterns`, the Cortex Patterns UI, and the export payload.
 *
 * Hybrid table per addendum §1.2: top-level lifecycle fields are
 * columns; `dimensions`, `outcome_metrics`, `evidence_summary` are
 * jsonb on the row but typed here.
 */
export interface Pattern {
  id: string;
  account_id: string;
  /** v2 multi-user placeholder; always null in v1. */
  team_scope_id: string | null;
  pattern_type: string;
  emitting_app: string;
  applies_to_icp: string | null;
  /** Deterministic identity hash, server-computed. */
  fingerprint: string;
  status: PatternLifecycleStatus;
  /** [0,1]. Phase 1 uses pinned deterministic formula in §1.6. */
  confidence_score: number;
  /** Count of distinct Ledger evidence events, not raw emissions. */
  observation_count: number;
  first_observed_at: string;
  last_observed_at: string;
  /**
   * Phase 1: from descriptor.decay_bounds.initial_decay_days at create.
   * Phase 2 calibration adjusts within `decay_bounds`.
   */
  effective_decay_days: number;
  /** last_observed_at + effective_decay_days. */
  decay_at: string;
  validated_at: string | null;
  declining_at: string | null;
  archived_at: string | null;
  /** User pinned the pattern; exempts from auto-archive (§1.5 Read Path / user-override semantics). */
  user_starred: boolean;
  /** User suppressed; excluded from default reads, confidence projected to 0. */
  user_suppressed: boolean;
  user_annotation: string | null;
  /** The signature, validated against descriptor.dimensions_schema. */
  dimensions: Record<string, unknown>;
  outcome_metrics: PatternOutcomeMetric[];
  evidence_summary: PatternEvidenceSummary;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Emission payload (Synapse client → /api/synapse/patterns)
// ============================================================

/**
 * The wire shape Synapse clients pass to `synapse.emitPattern()`. The
 * server runs `descriptor.bucketize(dimensions)` BEFORE canonicalization,
 * then validates against `descriptor.dimensions_schema`. Apps pass raw
 * (un-bucketized) dimensions; bucketization is the descriptor's
 * responsibility, not the emitter's.
 */
export interface PatternEmissionPayload {
  /** Must be in the Pattern Type Registry. */
  pattern_type: string;
  /**
   * Raw dimension values pre-bucketization. The server applies
   * `descriptor.bucketize` (when declared) then canonicalizes and
   * fingerprints.
   */
  dimensions: Record<string, unknown>;
  outcome_metrics: PatternOutcomeMetric[];
  applies_to_icp?: string | null;
  /**
   * Ledger entry IDs constituting the evidence for this emission. The
   * server uses these for idempotency: if every ref is already in the
   * existing pattern's `evidence_summary.last_n_ledger_ids`, the
   * emission is treated as a duplicate.
   */
  evidence_refs: string[];
}

// ============================================================
// Emission result (discriminated union)
// ============================================================

/**
 * Discriminated result returned by `/api/synapse/patterns`. Apps use
 * the `outcome` field to decide retry behavior, surface emission
 * status in their own UI, and so on. Rejection outcomes carry a
 * `reason` so the emitter can fail loud.
 */
export type PatternEmissionResult =
  | {
      outcome: "created_emerging";
      pattern_id: string;
      status: "emerging";
      confidence_score: number;
      observation_count: number;
    }
  | {
      outcome: "evidence_added";
      pattern_id: string;
      status: PatternLifecycleStatus;
      confidence_score: number;
      observation_count: number;
    }
  | {
      outcome: "promoted";
      pattern_id: string;
      status: "validated";
      confidence_score: number;
      observation_count: number;
      transitioned_from: "emerging" | "declining";
    }
  | {
      outcome: "demoted";
      pattern_id: string;
      status: "declining";
      confidence_score: number;
      observation_count: number;
      transitioned_from: "validated";
    }
  | {
      outcome: "duplicate_ignored";
      pattern_id: string;
      reason: "evidence_refs_covered";
    }
  | {
      outcome: "rejected_unregistered_type";
      reason: string;
    }
  | {
      outcome: "rejected_schema";
      reason: string;
      zod_issues?: unknown;
    }
  | {
      outcome: "rejected_metric_unit";
      reason: string;
      metric_name?: string;
    }
  | {
      outcome: "rejected_emitting_app";
      reason: string;
    }
  | {
      outcome: "rejected_inactive_synapse";
      reason: string;
    };

// ============================================================
// Export schema (versioned payload for /api/cortex/patterns/export)
// ============================================================

/** Current export schema version. Phase 1 emits "1.0.0". */
export type PatternExportSchemaVersion = "1.0.0";

/** A single pattern as it appears in the export file. */
export interface PatternExportEntry {
  pattern_type: string;
  emitting_app: string;
  applies_to_icp: string | null;
  status: PatternLifecycleStatus;
  confidence_score: number;
  observation_count: number;
  first_observed_at: string;
  last_observed_at: string;
  effective_decay_days: number;
  user_starred: boolean;
  user_suppressed: boolean;
  user_annotation: string | null;
  dimensions: Record<string, unknown>;
  outcome_metrics: PatternOutcomeMetric[];
}

/** The full export payload returned by GET /api/cortex/patterns/export. */
export interface PatternExportPayload {
  schema_version: PatternExportSchemaVersion;
  exported_at: string;
  account_id: string;
  patterns: PatternExportEntry[];
}

/**
 * The result of POST /api/cortex/patterns/import. Per-pattern errors
 * surface in `errors`; the request as a whole completes when all
 * patterns have been processed.
 */
export interface PatternImportResult {
  imported: number;
  skipped: number;
  errors: Array<{
    pattern_type: string;
    fingerprint?: string;
    reason: string;
  }>;
}
