"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Stat, ProgressBar, Sparkline, StatusPill, AsyncSection } from "@kinetiks/ui";
import type { GoalProgressView } from "@/lib/oracle/goal-view";
import { goalStatusLabel, goalStatusTone, formatGoalValue } from "./goal-status";

const TONE_VAR: Record<string, string> = {
  accent: "var(--kt-accent)",
  success: "var(--kt-success)",
  warning: "var(--kt-warning)",
  danger: "var(--kt-danger)",
  neutral: "var(--kt-fg-3)",
};

export function GoalOverview() {
  const [goals, setGoals] = useState<GoalProgressView[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setFetchError(null);
    fetch("/api/oracle/goals")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load goals (${res.status})`);
        return res.json();
      })
      .then((data) => setGoals(data.data?.goals ?? []))
      .catch((err) => setFetchError(err instanceof Error ? err.message : "Failed to load goals"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AsyncSection
      loading={loading}
      error={fetchError}
      isEmpty={goals.length === 0}
      onRetry={load}
      errorTitle="We couldn't load your goals."
      emptyFallback={
        <Card variant="muted">
          <div className="kt-body">No active goals yet. Create goals in Cortex to track progress here.</div>
        </Card>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--kt-s-3)" }}>
        {goals.map((goal) => (
          <GoalCard key={goal.goal_id} goal={goal} />
        ))}
      </div>
    </AsyncSection>
  );
}

function GoalCard({ goal }: { goal: GoalProgressView }) {
  const tone = goalStatusTone(goal.status);
  const tickAt =
    goal.target_value > 0 ? Math.min(1, goal.expected_value / goal.target_value) : undefined;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--kt-s-2)", marginBottom: "var(--kt-s-3)" }}>
        <span className="kt-card-title">{goal.name}</span>
        <StatusPill tone={tone}>{goalStatusLabel(goal.status)}</StatusPill>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--kt-s-2)", marginBottom: "var(--kt-s-3)" }}>
        <span className="kt-data-large">{formatGoalValue(goal.current_value, goal.unit)}</span>
        <span className="kt-small">
          / {formatGoalValue(goal.target_value, goal.unit)} target · {goal.completion_percentage.toFixed(0)}%
        </span>
      </div>

      <ProgressBar
        value={goal.completion_percentage / 100}
        tone={tone}
        tickAt={tickAt}
        ariaLabel={`${goal.name}: ${goal.completion_percentage.toFixed(0)} percent of target, status ${goalStatusLabel(goal.status)}`}
      />

      {goal.recent_values.length >= 2 ? (
        <div style={{ marginTop: "var(--kt-s-3)" }}>
          <Sparkline
            values={goal.recent_values}
            width={260}
            height={28}
            color={TONE_VAR[tone] ?? "var(--kt-accent)"}
            showEndDot
            ariaLabel={`${goal.name} recent trend`}
          />
        </div>
      ) : null}

      <div className="kt-small" style={{ marginTop: "var(--kt-s-3)" }}>
        {goal.forecast_value !== null
          ? `Forecast ${formatGoalValue(goal.forecast_value, goal.unit)} by period end · ${goal.days_remaining}d left`
          : `${goal.days_remaining}d left`}
      </div>
    </Card>
  );
}
