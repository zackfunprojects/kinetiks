/**
 * Intervention trust signals (collaborative-workspace-spec §9.3, §8.3).
 *
 * In the collaborative workspace, intervention replaces some permission
 * dialogs: grabbing a field, editing, undoing, or never touching a system-
 * filled field are implicit trust signals that feed the confidence model
 * alongside explicit approvals. This is the centralized, auditable registry of
 * their weights (replacing ad-hoc multipliers, per plan D6) — a pure module so
 * it is unit-testable without a Supabase mock.
 *
 * Weights are expressed as deltas to the per-category auto-approve threshold,
 * on the same scale as the rejection contraction in `threshold-math.ts`
 * (1 rejection = +10pts). Positive = trust contraction (raise the bar);
 * negative = trust expansion (lower it).
 *
 * INTEGRATION SEAM: applying these to `kinetiks_approval_thresholds` and writing
 * the `intervention_grab` / `intervention_undo` / `task_killed` Ledger entries
 * runs through `learning-loop.ts`. That wiring touches the Approval System and
 * is sequenced deliberately (kill at 2x lands with the task drawer in 8.6);
 * this module defines the weights and the pure application math now.
 */

export type InterventionSignal =
  | "kill"
  | "undo"
  | "grab"
  | "edit"
  | "non_intervention";

export interface SignalWeight {
  /** Points added to the auto-approve threshold. Positive = contraction. */
  thresholdDelta: number;
  /** Whether the signal breaks the consecutive-clean streak. */
  resetsStreak: boolean;
  /** Ledger event type emitted for this signal (null = no dedicated entry). */
  ledgerEventType: "task_killed" | "intervention_undo" | "intervention_grab" | null;
  description: string;
}

export const SIGNAL_WEIGHTS: Record<InterventionSignal, SignalWeight> = {
  // Killing an in-flight task is witnessed in real time and carries 2x a
  // standard rejection (§8.3): one kill = +20pts, like two rejections.
  kill: {
    thresholdDelta: 20,
    resetsStreak: true,
    ledgerEventType: "task_killed",
    description: "Killed an in-flight task — 2x a rejection",
  },
  // Undoing a system action is a weak rejection (§9.3).
  undo: {
    thresholdDelta: 5,
    resetsStreak: true,
    ledgerEventType: "intervention_undo",
    description: "Undid a system action — weak rejection",
  },
  // Grabbing a field the system was about to fill: a small field-level penalty.
  grab: {
    thresholdDelta: 3,
    resetsStreak: true,
    ledgerEventType: "intervention_grab",
    description: "Took over a field the system was about to fill",
  },
  // Editing before approving is a training signal — breaks the streak, no penalty.
  edit: {
    thresholdDelta: 0,
    resetsStreak: true,
    ledgerEventType: null,
    description: "Edited before approving — training signal",
  },
  // Never touching a field the system filled: a small trust boost.
  non_intervention: {
    thresholdDelta: -2,
    resetsStreak: false,
    ledgerEventType: null,
    description: "Left a system-filled field untouched — trust boost",
  },
};

/** Apply an intervention signal's weight to a threshold, clamped to [0, 100]. */
export function applySignalToThreshold(
  threshold: number,
  signal: InterventionSignal
): number {
  const delta = SIGNAL_WEIGHTS[signal].thresholdDelta;
  return Math.max(0, Math.min(100, threshold + delta));
}
