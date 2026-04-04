import type { Goal, GoalProgressStatus } from "@/lib/goals/types";

export interface GoalProgress {
  goal_id: string;
  current_value: number;
  target_value: number;
  completion_percentage: number;
  pace: "ahead" | "on_pace" | "behind" | "far_behind";
  status: GoalProgressStatus;
  days_remaining: number;
  days_elapsed: number;
  expected_value: number;
  forecast_value: number | null;
  trend: "improving" | "stable" | "declining";
}

/**
 * Calculate goal progress with pace and status determination.
 */
export function calculateGoalProgress(
  goal: Goal,
  recentValues: number[]
): GoalProgress {
  const targetValue = goal.target_value ?? 0;
  const currentValue = goal.current_value;
  const completion = targetValue > 0 ? (currentValue / targetValue) * 100 : 0;

  const now = new Date();
  const periodStart = goal.period_start ? new Date(goal.period_start) : now;
  const periodEnd = goal.period_end ? new Date(goal.period_end) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const totalDays = Math.max(1, (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
  const daysElapsed = Math.max(0, (now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, totalDays - daysElapsed);
  const timeProgress = daysElapsed / totalDays;

  // Expected value based on linear pace
  const expectedValue = targetValue * timeProgress;

  // Determine pace
  const paceRatio = expectedValue > 0 ? currentValue / expectedValue : 1;
  let pace: GoalProgress["pace"];
  if (paceRatio >= 1.1) pace = "ahead";
  else if (paceRatio >= 0.85) pace = "on_pace";
  else if (paceRatio >= 0.6) pace = "behind";
  else pace = "far_behind";

  // Determine trend from recent values
  const trend = determineTrend(recentValues);

  // Forecast
  const forecastValue = recentValues.length >= 3
    ? simpleLinearForecast(recentValues, daysRemaining)
    : null;

  // Determine status
  const status = determineStatus(completion, pace, daysRemaining, trend);

  return {
    goal_id: goal.id,
    current_value: currentValue,
    target_value: targetValue,
    completion_percentage: Math.round(completion * 100) / 100,
    pace,
    status,
    days_remaining: Math.round(daysRemaining),
    days_elapsed: Math.round(daysElapsed),
    expected_value: Math.round(expectedValue * 100) / 100,
    forecast_value: forecastValue !== null ? Math.round(forecastValue * 100) / 100 : null,
    trend,
  };
}

function determineTrend(values: number[]): GoalProgress["trend"] {
  if (values.length < 2) return "stable";

  const recent = values.slice(-3);
  const diffs = [];
  for (let i = 1; i < recent.length; i++) {
    diffs.push(recent[i] - recent[i - 1]);
  }

  const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;

  if (avgDiff > 0) return "improving";
  if (avgDiff < 0) return "declining";
  return "stable";
}

function determineStatus(
  completion: number,
  pace: GoalProgress["pace"],
  daysRemaining: number,
  trend: GoalProgress["trend"]
): GoalProgressStatus {
  if (completion >= 100) return "on_track"; // Completed

  if (pace === "ahead") return "ahead";
  if (pace === "on_pace") return "on_track";

  // Behind - severity depends on time remaining and trend
  if (pace === "far_behind" || (pace === "behind" && daysRemaining < 7 && trend === "declining")) {
    return "critical";
  }

  if (pace === "behind" && trend === "declining") return "at_risk";

  return "behind";
}

function simpleLinearForecast(values: number[], daysAhead: number): number {
  if (values.length < 2) return values[values.length - 1] ?? 0;

  // Simple linear regression
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Project forward
  return intercept + slope * (n - 1 + daysAhead);
}
