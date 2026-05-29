import type { PillTone, ProgressTone } from "@kinetiks/ui";
import type { GoalProgressStatus } from "@/lib/goals/types";

const LABELS: Record<GoalProgressStatus, string> = {
  on_track: "On track",
  ahead: "Ahead",
  behind: "Behind",
  at_risk: "At risk",
  critical: "Critical",
};

const TONES: Record<GoalProgressStatus, PillTone & ProgressTone> = {
  on_track: "success",
  ahead: "accent",
  behind: "warning",
  at_risk: "warning",
  critical: "danger",
};

export function goalStatusLabel(status: GoalProgressStatus): string {
  return LABELS[status];
}

export function goalStatusTone(status: GoalProgressStatus): PillTone & ProgressTone {
  return TONES[status];
}

/** Format a goal value respecting its unit (percentages get a trailing %). */
export function formatGoalValue(value: number, unit: string): string {
  const rounded = Math.round(value * 10) / 10;
  const num = rounded.toLocaleString();
  return unit === "percentage" ? `${num}%` : num;
}
