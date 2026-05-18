/**
 * Pattern Library types per the Kinetiks Contract Addendum §1.
 *
 * L1b alignment: the Pattern row carries a SINGLE primary outcome
 * (outcome_metric + outcome_value + outcome_direction + baseline_value
 * + lift_ratio) per canonical §1.2. Multi-outcome patterns become
 * multiple pattern types — e.g. harvest.icp_resonance.reply_rate vs
 * harvest.icp_resonance.meeting_book_rate — sharing fingerprint
 * dimensions but tracking different outcomes.
 *
 * The `source_app` field replaces the L1a `emitting_app` column.
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

/** Outcome direction: whether higher or lower outcome_value is better. */
export type PatternOutcomeDirection = "higher_is_better" | "lower_is_better";

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
  };
}

// ============================================================
// Pattern provenance (import attribution)
// ============================================================

/** Provenance block for an imported pattern, per addendum §1.7. */
export interface PatternImportedFrom {
  /** Hashed account_id from the source export. Truncated to 16 hex chars. */
  account_id: string | null;
  exported_at: string;
}

// ============================================================
// Pattern row (read shape)
// ============================================================

/**
 * The shape returned by `apps/id/src/lib/cortex/patterns/list.ts`,
 * `query_patterns`, the Cortex Patterns UI, and the export payload.
 *
 * Hybrid table per addendum §1.2: top-level lifecycle/outcome/evidence
 * fields are columns; `dimensions` and `evidence_summary` are jsonb
 * on the row but typed here.
 *
 * Single-primary outcome: each pattern row carries one outcome_metric
 * + outcome_value + outcome_direction + baseline_value + lift_ratio.
 * Multi-outcome insights are modeled as separate pattern types with
 * shared fingerprint dimensions.
 */
export interface Pattern {
  id: string;
  account_id: string;
  /** v2 multi-user placeholder; always null in v1. */
  team_scope_id: string | null;

  // Source
  /** The originating app (e.g. 'harvest', 'dark_madder', 'implosion'). */
  source_app: string;
  /** Workflow run that produced this pattern, if applicable (Phase 3+). */
  source_workflow_id: string | null;

  // Identity
  pattern_type: string;
  applies_to_icp: string | null;
  /** Deterministic identity hash, server-computed. */
  fingerprint: string;

  // Outcome (canonical single-primary)
  /** e.g. "reply_rate", "meeting_book_rate", "deal_close_rate", "ctr". */
  outcome_metric: string;
  outcome_value: number;
  outcome_direction: PatternOutcomeDirection;
  /** Account's baseline for this metric, when computable; null otherwise. */
  baseline_value: number | null;
  /** outcome_value / baseline_value when both present; null otherwise. */
  lift_ratio: number | null;

  // Evidence
  /** Total samples backing the outcome_value (running sum). */
  sample_size: number;
  /** Count of distinct Ledger evidence events. */
  observation_count: number;
  /** [0,1]. Phase 1 uses pinned deterministic formula in §1.6. */
  confidence_score: number;
  /** Statistical variance of the outcome series; null when sample_size < 2. */
  variance: number | null;

  // Lifecycle
  status: PatternLifecycleStatus;
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

  // Provenance
  imported: boolean;
  imported_from: PatternImportedFrom | null;

  // User overrides
  /** User pinned the pattern; exempts from auto-archive (§1.5 Read Path / user-override semantics). */
  user_starred: boolean;
  /** User suppressed; excluded from default reads, confidence projected to 0 (§1.5). */
  user_suppressed: boolean;
  user_annotation: string | null;

  // Variable-shape payload
  /** The signature, validated against descriptor.dimensions_schema. */
  dimensions: Record<string, unknown>;
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
 *
 * Canonical single-primary outcome shape: one outcome per emission.
 * The outcome_metric on the payload must equal the descriptor's
 * declared outcome_metric — emissions to a pattern_type can only
 * report on that type's primary metric.
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

  // Outcome (single primary; must match the descriptor's outcome_metric)
  outcome_metric: string;
  outcome_value: number;
  outcome_direction: PatternOutcomeDirection;
  /** Account's baseline for this metric, when the emitter can compute it. */
  baseline_value?: number | null;
  /** Samples backing this emission's outcome_value. */
  sample_size: number;
  /** Variance of the underlying outcome distribution for this emission. */
  variance?: number | null;

  applies_to_icp?: string | null;
  /** Phase 3+: the Workflow run that produced this pattern. */
  source_workflow_id?: string | null;
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
      sample_size: number;
      lift_ratio: number | null;
    }
  | {
      outcome: "evidence_added";
      pattern_id: string;
      status: PatternLifecycleStatus;
      confidence_score: number;
      observation_count: number;
      sample_size: number;
      lift_ratio: number | null;
    }
  | {
      outcome: "promoted";
      pattern_id: string;
      status: "validated";
      confidence_score: number;
      observation_count: number;
      sample_size: number;
      lift_ratio: number | null;
      transitioned_from: "emerging" | "declining";
    }
  | {
      outcome: "demoted";
      pattern_id: string;
      status: "declining";
      confidence_score: number;
      observation_count: number;
      sample_size: number;
      lift_ratio: number | null;
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
      outcome: "rejected_outcome_mismatch";
      reason: string;
      expected_metric?: string;
      received_metric?: string;
    }
  | {
      outcome: "rejected_source_app";
      reason: string;
    }
  | {
      outcome: "rejected_inactive_synapse";
      reason: string;
    };

// ============================================================
// Export / Import (per addendum §1.7)
// ============================================================

/** Current export schema version. */
export type PatternExportSchemaVersion = "1.0.0";

/** Export request filters. Match the canonical PatternExportRequest. */
export interface PatternExportRequest {
  /** Filter by pattern type. Default: all. */
  pattern_types?: string[];
  /** Filter by source app. Default: all. */
  source_apps?: string[];
  /** Filter by lifecycle status. Default: all. */
  status_in?: PatternLifecycleStatus[];
  /** Wire format. v2 may add CSV or Parquet. */
  format: "json";
}

/** A single pattern as it appears in the export file. */
export interface PatternExportEntry {
  /** Internal ID preserved for round-trip; not used on import. */
  id: string;
  pattern_type: string;
  source_app: string;
  source_workflow_id: string | null;
  applies_to_icp: string | null;
  status: PatternLifecycleStatus;
  outcome_metric: string;
  outcome_value: number;
  outcome_direction: PatternOutcomeDirection;
  baseline_value: number | null;
  lift_ratio: number | null;
  sample_size: number;
  observation_count: number;
  variance: number | null;
  confidence_score: number;
  first_observed_at: string;
  last_observed_at: string;
  effective_decay_days: number;
  user_starred: boolean;
  user_suppressed: boolean;
  user_annotation: string | null;
  dimensions: Record<string, unknown>;
}

/**
 * The full export payload returned by GET /api/cortex/patterns/export.
 * Self-describing: includes the registry descriptors for every pattern
 * type present in the export, so a downstream consumer (or destination
 * account during import) has the context to interpret each pattern's
 * dimensions and outcome semantics.
 */
export interface PatternExportPayload {
  schema_version: PatternExportSchemaVersion;
  exported_at: string;
  /** The exporting account id. Redacted on cross-account import (hashed). */
  account_id: string;
  export_type: "full" | "filtered";
  /** Echo of the filters used to produce this export. */
  filters: PatternExportRequest;
  patterns: PatternExportEntry[];
  /**
   * Snapshot of registry descriptors for every pattern_type present in
   * `patterns`. Imports validate against the destination account's
   * registry but use this snapshot for display, mapping, and error
   * surfacing.
   */
  pattern_type_registry_snapshot: PatternTypeDescriptorSnapshot[];
}

/**
 * Descriptor snapshot stored in the export. A subset of the runtime
 * PatternTypeDescriptor — Zod schemas and functions don't serialize,
 * so we capture the LLM-readable metadata and the static constraint
 * fields.
 */
export interface PatternTypeDescriptorSnapshot {
  pattern_type: string;
  source_app: string;
  description: string;
  fingerprint_dimensions: string[];
  outcome_metric: string;
  outcome_unit: string;
  outcome_direction: PatternOutcomeDirection;
  read_apps: string[];
  customer_visible: boolean;
  decay_bounds: {
    initial_decay_days: number;
    decay_floor_days: number;
    decay_ceiling_days: number;
    calibration_sample_threshold: number;
  };
  confidence_thresholds: {
    validate_at: number;
    decline_at: number;
  };
  expected_max_fingerprints_per_account: number | null;
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
