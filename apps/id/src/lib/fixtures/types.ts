/**
 * Shared types for the Phase 1.5 fixture emitter.
 *
 * A FixtureEmission is the payload shape the fixtures registry hands
 * to the internal /api/internal/fixtures/emit route, which forwards it
 * to /api/synapse/patterns with the same JSON envelope a real Synapse
 * client would use. `source_app` is always the fixture sentinel.
 */

import type { PatternOutcomeDirection } from "@kinetiks/types";

export interface FixtureEmission {
  account_id: string;
  source_app: "kinetiks_fixtures";
  pattern_type: string;
  dimensions: Record<string, unknown>;
  outcome_metric: string;
  outcome_value: number;
  outcome_direction: PatternOutcomeDirection;
  baseline_value: number | null;
  sample_size: number;
  variance: number | null;
  source_workflow_id: string | null;
  applies_to_icp: string | null;
  evidence_refs: string[];
}

export interface FixtureGenerator {
  pattern_type: string;
  generate(args: { account_id: string }): FixtureEmission[];
}
