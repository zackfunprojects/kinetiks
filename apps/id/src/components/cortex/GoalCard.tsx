"use client";

import type { Goal } from "@/lib/goals/types";

interface GoalCardProps {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onArchive: (goalId: string) => void;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  on_track: { bg: "var(--success-muted)", text: "var(--success)" },
  ahead: { bg: "var(--info-muted)", text: "var(--info)" },
  behind: { bg: "var(--warning-muted)", text: "var(--warning)" },
  at_risk: { bg: "var(--error-muted)", text: "var(--error)" },
  critical: { bg: "var(--error-muted)", text: "var(--error)" },
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
        border: "1px solid var(--border-muted)",
        background: "var(--bg-surface-raised)",
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
              background: "var(--accent-subtle)",
              color: "var(--text-secondary)",
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
              color: "var(--text-tertiary)",
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
              color: "var(--text-tertiary)",
              cursor: "pointer",
              fontSize: 12,
              padding: "2px 6px",
            }}
          >
            Archive
          </button>
        </div>
      </div>

      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", marginBottom: 8 }}>
        {goal.name}
      </div>

      {goal.target_value !== null && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
            <span>{goal.current_value.toLocaleString()}</span>
            <span>{goal.target_value.toLocaleString()}</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: "var(--bg-inset)" }}>
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
                border: "1px solid var(--border-muted)",
                color: "var(--text-tertiary)",
              }}
            >
              {app}
            </span>
          ))}
        </div>
      )}

      {goal.target_period && (
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8, fontFamily: "var(--font-mono), monospace" }}>
          {goal.target_period} {goal.direction && `(${goal.direction})`}
        </div>
      )}
    </div>
  );
}
