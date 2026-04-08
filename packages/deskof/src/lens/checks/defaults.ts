/**
 * Default per-check thresholds for Lens.
 *
 * `advisory` and `blocking` are *score* thresholds where the check's
 * specific score crosses from clear → advisory → blocked. Each check
 * is responsible for normalizing its own raw inputs to a 0-1 score so
 * a single set of thresholds is meaningful.
 *
 * These defaults are tuned to hit the spec target rates from
 * CLAUDE.md (advisory 15-25%, block 1-3%) on the seed dataset.
 * Per-community calibration data from `deskof_community_gate_config`
 * (Phase 6 / Pulse) will override these on a community-by-community
 * basis at runtime.
 */

import type { GateCheckType } from "../../types/gate";

export const CHECK_DEFAULTS: Record<
  GateCheckType,
  { advisory: number; blocking: number }
> = {
  // self_promo_ratio: 30-day rolling promo/total. Spec target ≤ 0.30.
  self_promo_ratio: { advisory: 0.3, blocking: 0.5 },
  // link_presence: number of unique promotional URLs in the draft, normalized.
  link_presence: { advisory: 0.34, blocking: 0.67 },
  // tone_mismatch: LLM 0-1 distance from operator voice fingerprint.
  tone_mismatch: { advisory: 0.5, blocking: 0.8 },
  // redundancy: LLM 0-1 score against existing replies on the same thread.
  redundancy: { advisory: 0.5, blocking: 0.8 },
  // question_responsiveness: 1 - relevance. Higher = less responsive.
  question_responsiveness: { advisory: 0.5, blocking: 0.8 },
  // cppi: handled specially (uses CPPI level instead of these numbers),
  // but kept here so the table is exhaustive.
  cppi: { advisory: 0.6, blocking: 0.81 },
  // topic_spacing: count of similar replies in last 7d, normalized: 2 → 0.5, 3+ → 1.
  topic_spacing: { advisory: 0.5, blocking: 1.0 },
};
