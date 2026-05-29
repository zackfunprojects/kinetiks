"use client";

import { Card, Pill, StatusPill, ProgressBar, Sparkline, Button } from "@kinetiks/ui";
import type { Goal, GoalStatus } from "@/lib/goals/types";
import type { GoalProgressView } from "@/lib/oracle/goal-view";
import { goalStatusLabel, goalStatusTone, formatGoalValue } from "@/components/analytics/goal-status";

interface GoalCardProps {
  goal: Goal;
  progress?: GoalProgressView;
  onEdit: (goal: Goal) => void;
  onStatusChange: (goalId: string, status: GoalStatus) => void;
  readOnly?: boolean;
}

const TONE_VAR: Record<string, string> = {
  accent: "var(--kt-accent)",
  success: "var(--kt-success)",
  warning: "var(--kt-warning)",
  danger: "var(--kt-danger)",
  neutral: "var(--kt-fg-3)",
};

export function GoalCard({ goal, progress, onEdit, onStatusChange, readOnly = false }: GoalCardProps) {
  const tone = goalStatusTone(goal.progress_status);
  const unit = progress?.unit ?? "count";
  // Fallback (when Oracle progress is missing) must respect goal.direction;
  // a raw current/target ratio misreports "below"/"exact" goals.
  const fallbackCompletion = (() => {
    if (!goal.target_value) return 0;
    if (goal.direction === "below") {
      return goal.current_value <= goal.target_value
        ? 100
        : Math.max(0, 100 - ((goal.current_value - goal.target_value) / goal.target_value) * 100);
    }
    if (goal.direction === "exact") {
      return Math.max(0, 100 - (Math.abs(goal.current_value - goal.target_value) / goal.target_value) * 100);
    }
    return Math.min((goal.current_value / goal.target_value) * 100, 100);
  })();
  const completion = progress?.completion_percentage ?? fallbackCompletion;

  return (
    <Card style={{ marginBottom: "var(--kt-s-2)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--kt-s-2)", marginBottom: "var(--kt-s-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--kt-s-2)" }}>
          <Pill tone="neutral">{goal.type === "kpi_target" ? "KPI" : "OKR"}</Pill>
          <StatusPill tone={tone}>{goalStatusLabel(goal.progress_status)}</StatusPill>
        </div>
        {!readOnly ? (
          <div style={{ display: "flex", gap: "var(--kt-s-1)" }}>
            <Button variant="ghost" size="sm" onClick={() => onEdit(goal)}>Edit</Button>
            {goal.status === "active" ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => onStatusChange(goal.id, "paused")}>Pause</Button>
                <Button variant="ghost" size="sm" onClick={() => onStatusChange(goal.id, "completed")}>Complete</Button>
              </>
            ) : null}
            {goal.status === "paused" ? (
              <Button variant="ghost" size="sm" onClick={() => onStatusChange(goal.id, "active")}>Resume</Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => onStatusChange(goal.id, "archived")}>Archive</Button>
          </div>
        ) : null}
      </div>

      <div className="kt-card-title" style={{ marginBottom: "var(--kt-s-3)" }}>{goal.name}</div>

      {goal.target_value !== null ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "var(--kt-s-2)" }}>
            <span className="kt-data-cell" style={{ color: "var(--kt-fg-1)" }}>
              {formatGoalValue(goal.current_value, unit)}
            </span>
            <span className="kt-small">
              {formatGoalValue(goal.target_value, unit)} target · {completion.toFixed(0)}%
            </span>
          </div>
          <ProgressBar
            value={completion / 100}
            tone={tone}
            tickAt={progress && goal.target_value > 0 ? Math.min(1, progress.expected_value / goal.target_value) : undefined}
            ariaLabel={`${goal.name}: ${completion.toFixed(0)} percent of target`}
          />
          {progress && progress.recent_values.length >= 2 ? (
            <div style={{ marginTop: "var(--kt-s-3)" }}>
              <Sparkline values={progress.recent_values} width={260} height={24} color={TONE_VAR[tone]} showEndDot ariaLabel={`${goal.name} trend`} />
            </div>
          ) : null}
          {progress?.forecast_value != null ? (
            <div className="kt-small" style={{ marginTop: "var(--kt-s-2)" }}>
              Forecast {formatGoalValue(progress.forecast_value, unit)} by period end · {progress.days_remaining}d left
            </div>
          ) : null}
        </>
      ) : null}

      {goal.contributing_apps.length > 0 ? (
        <div style={{ display: "flex", gap: "var(--kt-s-1)", flexWrap: "wrap", marginTop: "var(--kt-s-3)" }}>
          {goal.contributing_apps.map((app) => (
            <Pill key={app} tone="neutral">{app}</Pill>
          ))}
        </div>
      ) : null}

      {goal.target_period ? (
        <div className="kt-data-inline" style={{ color: "var(--kt-fg-3)", marginTop: "var(--kt-s-2)" }}>
          {goal.target_period}{goal.direction ? ` · ${goal.direction}` : ""}
        </div>
      ) : null}
    </Card>
  );
}
