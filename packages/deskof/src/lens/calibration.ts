/**
 * Per-user calibration: turns the operator profile + community config
 * into a LensConfig that the engine consumes.
 *
 * Implements Final Supplement §6.3 (Gate Calibration Methodology):
 *
 *   Days 1-30  → advisory_only=true. No check ever blocks.
 *   Days 31-60 → only `self_promo_ratio` may block.
 *   Days 61-90 → incremental enable: every ~4 days a new check joins
 *                the blocking set, in order:
 *                  cppi → link_presence → tone_mismatch
 *                  → redundancy → question_responsiveness → topic_spacing
 *   Day 91+    → all checks blocking-enabled.
 *
 * The advisory_only flag is also surfaced on `GateResult.advisory_only`
 * so the editor can render an explanatory hint ("Advisory mode for X
 * more days") and so the server-side validator in /api/reply/post
 * never returns a 422 during the first 30 days.
 *
 * Free-tier callers pass `tier="free"` so LLM-backed checks are removed
 * from `llm_checks_enabled`. The check rows simply don't appear in the
 * UI for those users (UpgradeGate handles the empty space).
 */

import type { GateCheckType } from "../types/gate";
import type { BillingTier } from "../types/track";
import type {
  CommunityGateConfig,
  EnabledChecks,
  LensConfig,
  LensOperatorView,
} from "./types";

const DAYS = 24 * 60 * 60 * 1000;

// topic_spacing intentionally NOT in this list — checkTopicSpacing
// only ever emits info / warning severities (the spec calls it
// "soft" guidance), so listing it as blocking-eligible would be a
// no-op at best and a misleading config contract at worst. The
// rollout schedule below stops at question_responsiveness and the
// Day 91+ steady state set is "all 5 entries" + self_promo_ratio.
const INCREMENTAL_ORDER: GateCheckType[] = [
  "cppi",
  "link_presence",
  "tone_mismatch",
  "redundancy",
  "question_responsiveness",
];

/** LLM-backed checks. Free tier never sees these. */
const LLM_CHECKS = new Set<GateCheckType>([
  "tone_mismatch",
  "redundancy",
  "question_responsiveness",
]);

export interface CalibrationInput {
  operator: LensOperatorView;
  /** Operator profile creation timestamp — phase boundary anchor. */
  profileCreatedAt: string;
  tier: BillingTier;
  /** Optional override row from deskof_community_gate_config */
  communityConfig?: CommunityGateConfig | null;
  /** Override clock for tests */
  now?: () => Date;
}

export function computeLensConfig(input: CalibrationInput): LensConfig {
  const now = (input.now ?? (() => new Date()))();
  const created = new Date(input.profileCreatedAt);
  const ageDays = Math.max(
    0,
    Math.floor((now.getTime() - created.getTime()) / DAYS)
  );

  const blocking = computeBlockingSet(ageDays);

  const llmEnabled: ReadonlySet<GateCheckType> =
    input.tier === "free" ? new Set() : LLM_CHECKS;

  // Per-community thresholds layer in last so they win over defaults.
  const thresholds: LensConfig["thresholds"] = {};
  if (input.communityConfig?.thresholds) {
    for (const [k, v] of Object.entries(input.communityConfig.thresholds)) {
      if (v) thresholds[k as GateCheckType] = v;
    }
  }

  return {
    advisory_only: ageDays < 30,
    blocking_enabled: blocking,
    llm_checks_enabled: llmEnabled,
    thresholds,
    sensitivity: { ...input.operator.per_check_sensitivity },
  };
}

function computeBlockingSet(ageDays: number): EnabledChecks {
  if (ageDays < 30) return new Set();
  if (ageDays < 60) return new Set<GateCheckType>(["self_promo_ratio"]);
  if (ageDays < 90) {
    // Days 60-89: enable INCREMENTAL_ORDER one entry every ~4 days
    // (6 entries across 30 days). Day 60 → just self_promo + cppi,
    // day 89 → all of them.
    const stepsUnlocked = Math.min(
      INCREMENTAL_ORDER.length,
      Math.floor((ageDays - 60) / 5) + 1
    );
    const enabled = new Set<GateCheckType>(["self_promo_ratio"]);
    for (let i = 0; i < stepsUnlocked; i++) {
      enabled.add(INCREMENTAL_ORDER[i]);
    }
    return enabled;
  }
  return new Set<GateCheckType>([
    "self_promo_ratio",
    ...INCREMENTAL_ORDER,
  ]);
}

/** Public for testing. Day at which advisory_only flips to false. */
export const ADVISORY_ONLY_DAYS = 30;
