"use client";

import type { Goal } from "@/lib/goals/types";

interface GoalCardProps {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onArchive: (goalId: string) => void;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  on_track: { bg: "var(--kt-success-soft)", text: "var(--kt-success)" },
  ahead: { bg: "var(--kt-accent-soft)", text: "var(--kt-accent)" },
  behind: { bg: "var(--kt-warning-soft)", text: "var(--kt-warning)" },
  at_risk: { bg: "var(--kt-danger-soft)", text: "var(--kt-danger)" },
  critical: { bg: "var(--kt-danger-soft)", text: "var(--kt-danger)" },
};

export function GoalCard({ goal, onEdit, onArchive }: GoalCardProps) {
  const progress = goal.target_value
    ? Math.min((goal.current_value / goal.target_value) * 100, 100)
    : 0;

  const statusStyle = STATUS_COLORS[goal.progress_status] ?? STATUS_COLORS.on_track;

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 8,
        border: "1px solid var(--kt-border-2)",
        background: "var(--kt-bg-muted)",
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: 4,
              background: "var(--kt-accent-soft)",
              color: "var(--kt-fg-2)",
              textTransform: "uppercase",
            }}
          >
            {goal.type === "kpi_target" ? "KPI" : "OKR"}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: 4,
              background: statusStyle.bg,
              color: statusStyle.text,
              textTransform: "uppercase",
            }}
          >
            {goal.progress_status.replace("_", " ")}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => onEdit(goal)}
            style={{
              background: "none",
              border: "none",
              color: "var(--kt-fg-3)",
              cursor: "pointer",
              fontSize: 12,
              padding: "2px 6px",
            }}
          >
            Edit
          </button>
          <button
            onClick={() => onArchive(goal.id)}
            style={{
              background: "none",
              border: "none",
              color: "var(--kt-fg-3)",
              cursor: "pointer",
              fontSize: 12,
              padding: "2px 6px",
            }}
          >
            Archive
          </button>
        </div>
      </div>

      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--kt-fg-1)", marginBottom: 8 }}>
        {goal.name}
      </div>

      {goal.target_value !== null && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--kt-fg-2)", marginBottom: 4 }}>
            <span>{goal.current_value.toLocaleString()}</span>
            <span>{goal.target_value.toLocaleString()}</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: "var(--kt-bg-base)" }}>
            <div
              style={{
                height: "100%",
                borderRadius: 2,
                background: statusStyle.text,
                width: `${progress}%`,
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>
      )}

      {goal.contributing_apps.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {goal.contributing_apps.map((app) => (
            <span
              key={app}
              style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 4,
                border: "1px solid var(--kt-border-2)",
                color: "var(--kt-fg-3)",
              }}
            >
              {app}
            </span>
          ))}
        </div>
      )}

      {goal.target_period && (
        <div style={{ fontSize: 11, color: "var(--kt-fg-3)", marginTop: 8, fontFamily: "var(--font-mono), monospace" }}>
          {goal.target_period} {goal.direction && `(${goal.direction})`}
        </div>
      )}
    </div>
  );
}
