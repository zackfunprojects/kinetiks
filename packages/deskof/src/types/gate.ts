/**
 * Quality gate (Lens) result types per CLAUDE.md.
 *
 * The gate runs in three phases per user:
 *   - Days 1-30: advisory-only mode (no blocking)
 *   - Days 31-60: blocking enabled for self-promotion ratio only
 *   - Day 61+: incremental blocking per check
 *
 * Target rates: advisory 15-25%, block 1-3%, override 30-50%,
 * post-gate removal 5-10%.
 */

export type GateStatus = "clear" | "advisory" | "blocked";

export type GateCheckType =
  | "self_promo_ratio"
  | "tone_mismatch"
  | "redundancy"
  | "question_responsiveness"
  | "link_presence"
  | "cppi"
  | "topic_spacing";

export type GateCheckSeverity = "info" | "warning" | "blocking";

export interface GateCheck {
  type: GateCheckType;
  passed: boolean;
  severity: GateCheckSeverity;
  message: string;
  recommendation: string;
}

export interface GateResult {
  status: GateStatus;
  checks: GateCheck[];
  /** Was this run in advisory-only mode (first 30 days per user)? */
  advisory_only: boolean;
}
