/**
 * Pure trust-calibration math, isolated from any server-only deps so it
 * can be unit-tested without a Supabase client mock.
 *
 * Trust expansion: 20 consecutive clean → −5pts, 50 consecutive → another −5pts
 * Trust contraction: 1 rejection → +10pts, 2 in 7 days → +20pts, 3 in 7 days → reset to 100
 */

import { SIGNAL_WEIGHTS, type InterventionSignal } from "./signal-weights";

export interface ThresholdState {
  auto_approve_threshold: number;
  consecutive_approvals: number;
  total_approvals: number;
  total_rejections: number;
}

export interface ThresholdUpdate {
  auto_approve_threshold: number;
  consecutive_approvals: number;
  total_approvals: number;
  total_rejections: number;
  approval_rate: number;
  last_rejection_at?: string;
}

export function computeThresholdUpdate(args: {
  existing: ThresholdState;
  event: "approved_clean" | "approved_with_edits" | "rejected";
  recentRejections?: number; // only used when event === 'rejected'
  now?: Date;
}): ThresholdUpdate {
  const { existing, event } = args;
  const now = args.now ?? new Date();
  if (event === "approved_clean") {
    const newConsecutive = existing.consecutive_approvals + 1;
    const newTotal = existing.total_approvals + 1;
    let threshold = existing.auto_approve_threshold;
    if (newConsecutive === 20) threshold = Math.max(threshold - 5, 0);
    if (newConsecutive === 50) threshold = Math.max(threshold - 5, 0);
    return {
      auto_approve_threshold: threshold,
      consecutive_approvals: newConsecutive,
      total_approvals: newTotal,
      total_rejections: existing.total_rejections,
      approval_rate: calculateRate(newTotal, existing.total_rejections),
    };
  }
  if (event === "approved_with_edits") {
    const newTotal = existing.total_approvals + 1;
    return {
      auto_approve_threshold: existing.auto_approve_threshold,
      consecutive_approvals: 0,
      total_approvals: newTotal,
      total_rejections: existing.total_rejections,
      approval_rate: calculateRate(newTotal, existing.total_rejections),
    };
  }
  // event === 'rejected'
  const newRejections = existing.total_rejections + 1;
  const recent = args.recentRejections ?? 1;
  let threshold = existing.auto_approve_threshold;
  if (recent >= 3) {
    threshold = 100;
  } else if (recent >= 2) {
    threshold = Math.min(threshold + 20, 100);
  } else {
    threshold = Math.min(threshold + 10, 100);
  }
  return {
    auto_approve_threshold: threshold,
    consecutive_approvals: 0,
    total_approvals: existing.total_approvals,
    total_rejections: newRejections,
    approval_rate: calculateRate(existing.total_approvals, newRejections),
    last_rejection_at: now.toISOString(),
  };
}

export function calculateRate(approvals: number, rejections: number): number {
  const total = approvals + rejections;
  if (total === 0) return 0;
  return Math.round((approvals / total) * 10000) / 100;
}

/**
 * Apply an implicit intervention signal (kill / undo / grab / edit /
 * non_intervention, §8.3 + §9.3) to a threshold. Registry-driven: the weight,
 * streak-reset, and rejection-class behaviour all come from `SIGNAL_WEIGHTS`,
 * so adding a signal never touches this math. Pure — unit-tested without a DB.
 *
 * `kill` lands at +20 (2× a standard rejection); `undo` +5 (weak rejection);
 * `grab` +3 (field-level penalty); `edit` 0 (training, streak reset only);
 * `non_intervention` −2 (trust boost).
 */
export function computeInterventionUpdate(args: {
  existing: ThresholdState;
  signal: InterventionSignal;
  now?: Date;
}): ThresholdUpdate {
  const { existing, signal } = args;
  const now = args.now ?? new Date();
  const weight = SIGNAL_WEIGHTS[signal];

  const threshold = Math.max(
    0,
    Math.min(100, existing.auto_approve_threshold + weight.thresholdDelta),
  );
  const newRejections = existing.total_rejections + (weight.isRejectionClass ? 1 : 0);
  const consecutive = weight.resetsStreak ? 0 : existing.consecutive_approvals;

  return {
    auto_approve_threshold: threshold,
    consecutive_approvals: consecutive,
    total_approvals: existing.total_approvals,
    total_rejections: newRejections,
    approval_rate: calculateRate(existing.total_approvals, newRejections),
    ...(weight.isRejectionClass ? { last_rejection_at: now.toISOString() } : {}),
  };
}
