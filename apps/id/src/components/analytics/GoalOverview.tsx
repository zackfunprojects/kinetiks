"use client";

import { useState, useEffect } from "react";
import type { GoalProgress } from "@/lib/oracle/goal-tracker";

const STATUS_COLORS: Record<string, string> = {
  on_track: "var(--success)",
  ahead: "var(--info)",
  behind: "var(--warning)",
  at_risk: "var(--error)",
  critical: "var(--error)",
};

export function GoalOverview() {
  const [goals, setGoals] = useState<GoalProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/oracle/goals")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load goals (${res.status})`);
        return res.json();
      })
      .then((data) => setGoals(data.data?.goals ?? []))
      .catch((err) => setFetchError(err instanceof Error ? err.message : "Failed to load goals"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ padding: 16, color: "var(--text-tertiary)", fontSize: 13 }}>Loading goals...</div>;
  }

  if (fetchError) {
    return (
      <div style={{ padding: 24, borderRadius: 8, border: "1px dashed var(--error-muted)", background: "var(--bg-surface)", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "var(--error)", margin: 0 }}>{fetchError}</p>
      </div>
    );
  }

  if (goals.length === 0) {
    return (
      <div style={{ padding: 24, borderRadius: 8, border: "1px dashed var(--border-default)", background: "var(--bg-surface)", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>
          No active goals. Create goals in Cortex to track them here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
      {goals.map((goal) => (
        <div
          key={goal.goal_id}
          style={{
            padding: 16,
            borderRadius: 8,
            border: "1px solid var(--border-muted)",
            background: "var(--bg-surface-raised)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
              {goal.goal_id.slice(0, 8)}...
            </span>
            <span style={{ fontSize: 11, color: STATUS_COLORS[goal.status] ?? "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase" }}>
              {goal.status.replace("_", " ")}
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ height: 6, borderRadius: 3, background: "var(--bg-inset)", marginBottom: 8 }}>
            <div
              style={{
                height: "100%",
                borderRadius: 3,
                background: STATUS_COLORS[goal.status] ?? "var(--text-tertiary)",
                width: `${Math.min(goal.completion_percentage, 100)}%`,
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)" }}>
            <span>{goal.current_value.toLocaleString()} / {goal.target_value.toLocaleString()}</span>
            <span>{goal.completion_percentage.toFixed(1)}%</span>
          </div>

          {goal.forecast_value !== null && (
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
              Forecast: {goal.forecast_value.toLocaleString()} ({goal.days_remaining}d remaining)
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
