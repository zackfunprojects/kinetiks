/**
 * Pattern Type Registry - the canonical inventory of every pattern_type
 * an app may emit to the Pattern Library.
 *
 * Per the Kinetiks Contract Addendum §1.3. An unregistered pattern_type cannot be
 * emitted (the /api/synapse/patterns endpoint rejects it) or referenced
 * from an Operator's required_patterns (the cross-registry validator
 * fails the boot).
 *
 * Registration validates structural invariants:
 *   - pattern_type is "<app>.<snake_case>" with a single dot
 *   - source_app non-empty; pattern_type prefix equals source_app
 *   - read_apps non-empty
 *   - dimensions_schema is a Zod schema
 *   - fingerprint_dimensions are non-empty and unique
 *   - outcome_metric, outcome_unit, outcome_direction declared
 *     (canonical single-primary outcome shape)
 *   - decay_bounds are consistent (floor <= initial <= ceiling, all positive)
 *   - confidence_thresholds.validate_at > confidence_thresholds.decline_at
 *   - expected_max_fingerprints_per_account, if declared, is reasonable
 *
 * Mirrors the Tool Registry / Action Class Registry pattern. Registry
 * is process-global. Tests reset via `_resetPatternTypeRegistryForTests`.
 */

import type { PatternTypeDescriptor } from "@kinetiks/types";
import { ToolError } from "./types";

const HARD_CARDINALITY_CEILING = 100_000;
const SOFT_CARDINALITY_WARNING = 1_000;

interface PatternTypeEntry {
  descriptor: PatternTypeDescriptor;
  registeredAt: number;
}

const registry = new Map<string, PatternTypeEntry>();

/**
 * Helper for building a typed PatternTypeDescriptor with dimension
 * type inference. Mirrors `defineTool` from `tool-registry.ts`.
 */
export function definePatternType<TDimensions extends Record<string, unknown>>(
  config: PatternTypeDescriptor<TDimensions>,
): PatternTypeDescriptor<TDimensions> {
  return config;
}

/**
 * Register a pattern type. Throws on structural violations. Idempotent
 * for the same descriptor. The generic parameter is a convenience for
 * the descriptor's TDimensions; the registry erases it at the boundary
 * because runtime validation is via the Zod schema, not the TS type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerPatternType(descriptor: PatternTypeDescriptor<any>): void {
  assertPatternTypeDescriptor(descriptor);
  const existing = registry.get(descriptor.pattern_type);
  if (existing) {
    if (descriptorsMatch(existing.descriptor, descriptor)) {
      return;
    }
    throw new ToolError(
      "configuration_error",
      `Pattern type "${descriptor.pattern_type}" is already registered with a conflicting descriptor`,
      { context: { pattern_type: descriptor.pattern_type } },
    );
  }
  registry.set(descriptor.pattern_type, {
    descriptor: descriptor as PatternTypeDescriptor,
    registeredAt: Date.now(),
  });
}

/** Get a pattern type by name. Returns undefined if unregistered. */
export function getPatternType(
  patternType: string,
): PatternTypeDescriptor | undefined {
  return registry.get(patternType)?.descriptor;
}

/** Strict variant: throws `missing_pattern_type` if absent. */
export function assertPatternType(patternType: string): PatternTypeDescriptor {
  const d = registry.get(patternType)?.descriptor;
  if (!d) {
    throw new ToolError(
      "missing_pattern_type",
      `Unknown pattern type: ${patternType}`,
      { context: { pattern_type: patternType } },
    );
  }
  return d;
}

/** All registered pattern types, in registration order. */
export function listPatternTypes(): PatternTypeDescriptor[] {
  return Array.from(registry.values())
    .sort((a, b) => a.registeredAt - b.registeredAt)
    .map((e) => e.descriptor);
}

/** Filtered list: pattern types whose `source_app` matches. */
export function listPatternTypesForSourceApp(
  app: string,
): PatternTypeDescriptor[] {
  return listPatternTypes().filter((d) => d.source_app === app);
}

/**
 * @deprecated Use `listPatternTypesForSourceApp` (canonical naming per
 * the Kinetiks Contract Addendum §1.3). Kept as a thin alias during
 * the L1b alignment so call-site renames can land separately.
 */
export const listPatternTypesForEmittingApp = listPatternTypesForSourceApp;

/** Filtered list: pattern types this app is allowed to read. */
export function listPatternTypesForReadingApp(
  app: string,
): PatternTypeDescriptor[] {
  return listPatternTypes().filter((d) => d.read_apps.includes(app));
}

/** Filtered list: pattern types eligible for the customer-facing UI. */
export function listCustomerVisiblePatternTypes(): PatternTypeDescriptor[] {
  return listPatternTypes().filter((d) => d.customer_visible);
}

// ============================================================
// Structural validation
// ============================================================

function assertPatternTypeDescriptor(d: PatternTypeDescriptor): void {
  if (!d.pattern_type || typeof d.pattern_type !== "string") {
    throw new ToolError(
      "configuration_error",
      `PatternTypeDescriptor.pattern_type must be a non-empty string`,
      {},
    );
  }
  // Canonical L1b: allow multi-segment pattern types like
  // "harvest.icp_resonance.reply_rate" — first segment is the app prefix,
  // remaining segments are the pattern_type name (snake_case, dot-separated).
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(d.pattern_type)) {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" must match "<app>.<snake_case_segment>[.<snake_case_segment>...]" (lowercase, dot-separated)`,
      { context: { pattern_type: d.pattern_type } },
    );
  }
  if (!d.description || d.description.trim().length < 24) {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" must have a description of at least 24 chars (LLM needs context)`,
      { context: { pattern_type: d.pattern_type } },
    );
  }
  if (!d.source_app || typeof d.source_app !== "string") {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" must declare a source_app`,
      { context: { pattern_type: d.pattern_type } },
    );
  }
  // The pattern_type prefix must equal source_app.
  const prefix = d.pattern_type.split(".")[0];
  if (prefix !== d.source_app) {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" prefix "${prefix}" must equal source_app "${d.source_app}"`,
      {
        context: {
          pattern_type: d.pattern_type,
          source_app: d.source_app,
        },
      },
    );
  }
  if (!Array.isArray(d.read_apps) || d.read_apps.length === 0) {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" must declare at least one read_app`,
      { context: { pattern_type: d.pattern_type } },
    );
  }
  if (typeof d.customer_visible !== "boolean") {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" must declare customer_visible as boolean`,
      { context: { pattern_type: d.pattern_type } },
    );
  }
  if (!d.dimensions_schema || typeof d.dimensions_schema.parse !== "function") {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" dimensions_schema must be a Zod schema`,
      { context: { pattern_type: d.pattern_type } },
    );
  }
  if (
    !Array.isArray(d.fingerprint_dimensions) ||
    d.fingerprint_dimensions.length === 0
  ) {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" must declare at least one fingerprint_dimensions field`,
      { context: { pattern_type: d.pattern_type } },
    );
  }
  // Detect duplicate fingerprint dimensions
  const fpDims = d.fingerprint_dimensions.map((k) => String(k));
  if (new Set(fpDims).size !== fpDims.length) {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" fingerprint_dimensions must be unique`,
      { context: { pattern_type: d.pattern_type, fields: fpDims } },
    );
  }
  if (d.bucketize !== undefined && typeof d.bucketize !== "function") {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" bucketize must be a function when declared`,
      { context: { pattern_type: d.pattern_type } },
    );
  }
  // Canonical L1b: single primary outcome per descriptor.
  if (!d.outcome_metric || typeof d.outcome_metric !== "string") {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" must declare a non-empty outcome_metric string`,
      { context: { pattern_type: d.pattern_type } },
    );
  }
  if (!d.outcome_unit || typeof d.outcome_unit !== "string") {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" must declare a non-empty outcome_unit string`,
      { context: { pattern_type: d.pattern_type } },
    );
  }
  if (
    d.outcome_direction !== "higher_is_better" &&
    d.outcome_direction !== "lower_is_better"
  ) {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" outcome_direction must be 'higher_is_better' or 'lower_is_better'`,
      { context: { pattern_type: d.pattern_type } },
    );
  }
  // decay_bounds
  const db = d.decay_bounds;
  if (!db || typeof db !== "object") {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" must declare decay_bounds`,
      { context: { pattern_type: d.pattern_type } },
    );
  }
  if (
    !Number.isFinite(db.initial_decay_days) ||
    !Number.isFinite(db.decay_floor_days) ||
    !Number.isFinite(db.decay_ceiling_days)
  ) {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" decay_bounds must contain numeric initial/floor/ceiling`,
      { context: { pattern_type: d.pattern_type } },
    );
  }
  if (
    db.decay_floor_days <= 0 ||
    db.initial_decay_days <= 0 ||
    db.decay_ceiling_days <= 0
  ) {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" decay_bounds must be positive day counts`,
      { context: { pattern_type: d.pattern_type } },
    );
  }
  if (
    db.decay_floor_days > db.initial_decay_days ||
    db.initial_decay_days > db.decay_ceiling_days
  ) {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" decay_bounds must satisfy floor <= initial <= ceiling`,
      {
        context: {
          pattern_type: d.pattern_type,
          floor: db.decay_floor_days,
          initial: db.initial_decay_days,
          ceiling: db.decay_ceiling_days,
        },
      },
    );
  }
  if (
    !Number.isInteger(db.calibration_sample_threshold) ||
    db.calibration_sample_threshold < 0
  ) {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" decay_bounds.calibration_sample_threshold must be a non-negative integer`,
      { context: { pattern_type: d.pattern_type } },
    );
  }
  // confidence_thresholds
  const ct = d.confidence_thresholds;
  if (!ct || typeof ct !== "object") {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" must declare confidence_thresholds`,
      { context: { pattern_type: d.pattern_type } },
    );
  }
  if (
    typeof ct.validate_at !== "number" ||
    ct.validate_at < 0 ||
    ct.validate_at > 1 ||
    typeof ct.decline_at !== "number" ||
    ct.decline_at < 0 ||
    ct.decline_at > 1
  ) {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" confidence_thresholds must be numbers in [0,1]`,
      { context: { pattern_type: d.pattern_type } },
    );
  }
  if (ct.validate_at <= ct.decline_at) {
    throw new ToolError(
      "configuration_error",
      `Pattern type "${d.pattern_type}" confidence_thresholds.validate_at must be strictly greater than decline_at`,
      {
        context: {
          pattern_type: d.pattern_type,
          validate_at: ct.validate_at,
          decline_at: ct.decline_at,
        },
      },
    );
  }
  // expected_max_fingerprints_per_account
  if (d.expected_max_fingerprints_per_account !== undefined) {
    const m = d.expected_max_fingerprints_per_account;
    if (!Number.isInteger(m) || m <= 0) {
      throw new ToolError(
        "configuration_error",
        `Pattern type "${d.pattern_type}" expected_max_fingerprints_per_account must be a positive integer`,
        { context: { pattern_type: d.pattern_type } },
      );
    }
    if (m > HARD_CARDINALITY_CEILING) {
      throw new ToolError(
        "configuration_error",
        `Pattern type "${d.pattern_type}" expected_max_fingerprints_per_account (${m}) exceeds the hard ceiling of ${HARD_CARDINALITY_CEILING}; revisit bucketization`,
        {
          context: { pattern_type: d.pattern_type, declared: m },
        },
      );
    }
    if (m > SOFT_CARDINALITY_WARNING) {
      // eslint-disable-next-line no-console
      console.warn(
        `[pattern-type-registry] Pattern type "${d.pattern_type}" declares expected_max_fingerprints_per_account=${m}, above the soft ceiling of ${SOFT_CARDINALITY_WARNING}. Verify bucketization is sufficient.`,
      );
    }
  } else {
    // Declared absence is a warning. Cardinality intent helps prevent
    // explosion (Kinetiks Contract Addendum §1.3 - registered cardinality intent).
    // eslint-disable-next-line no-console
    console.warn(
      `[pattern-type-registry] Pattern type "${d.pattern_type}" did not declare expected_max_fingerprints_per_account. Add cardinality intent to help prevent pattern type explosion.`,
    );
  }
}

function descriptorsMatch(
  a: PatternTypeDescriptor,
  b: PatternTypeDescriptor,
): boolean {
  return (
    a.pattern_type === b.pattern_type &&
    a.source_app === b.source_app &&
    a.description === b.description &&
    a.customer_visible === b.customer_visible &&
    JSON.stringify([...a.read_apps].sort()) ===
      JSON.stringify([...b.read_apps].sort()) &&
    JSON.stringify(a.fingerprint_dimensions.map(String)) ===
      JSON.stringify(b.fingerprint_dimensions.map(String)) &&
    a.outcome_metric === b.outcome_metric &&
    a.outcome_unit === b.outcome_unit &&
    a.outcome_direction === b.outcome_direction &&
    JSON.stringify(a.decay_bounds) === JSON.stringify(b.decay_bounds) &&
    JSON.stringify(a.confidence_thresholds) ===
      JSON.stringify(b.confidence_thresholds) &&
    a.expected_max_fingerprints_per_account ===
      b.expected_max_fingerprints_per_account
  );
}

// ============================================================
// Test-only escape hatch
// ============================================================

export function _resetPatternTypeRegistryForTests(): void {
  registry.clear();
}
