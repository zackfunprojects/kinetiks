"use client";

import { useState } from "react";
import type { Goal, GoalType, GoalPeriod, GoalDirection } from "@/lib/goals/types";

interface GoalEditorProps {
  goal?: Goal | null;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function GoalEditor({ goal, onSave, onCancel }: GoalEditorProps) {
  const [name, setName] = useState(goal?.name ?? "");
  const [type, setType] = useState<GoalType>(goal?.type ?? "kpi_target");
  const [targetValue, setTargetValue] = useState(goal?.target_value?.toString() ?? "");
  const [targetPeriod, setTargetPeriod] = useState<GoalPeriod | "">(goal?.target_period ?? "monthly");
  const [direction, setDirection] = useState<GoalDirection>(goal?.direction ?? "above");
  const [metricKey, setMetricKey] = useState(goal?.metric_key ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);

    const data: Record<string, unknown> = {
      name: name.trim(),
      type,
      metric_key: metricKey || null,
      target_value: targetValue ? parseFloat(targetValue) : null,
      target_period: targetPeriod || null,
      direction,
    };

    if (goal) data.id = goal.id;

    onSave(data);
    setSaving(false);
  };

  return (
    <div
      style={{
        padding: 20,
        borderRadius: 8,
        border: "1px solid var(--border-default)",
        background: "var(--bg-surface)",
        marginBottom: 16,
      }}
    >
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 16px" }}>
        {goal ? "Edit Goal" : "New Goal"}
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Monthly pipeline growth"
            autoFocus
            style={inputStyle}
          />
        </Field>

        <Field label="Type">
          <div style={{ display: "flex", gap: 8 }}>
            <TypeButton label="KPI Target" active={type === "kpi_target"} onClick={() => setType("kpi_target")} />
            <TypeButton label="OKR" active={type === "okr"} onClick={() => setType("okr")} />
          </div>
        </Field>

        {type === "kpi_target" && (
          <>
            <Field label="Target Value">
              <input
                type="number"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder="100"
                style={inputStyle}
              />
            </Field>

            <div style={{ display: "flex", gap: 12 }}>
              <Field label="Period" flex>
                <select value={targetPeriod} onChange={(e) => setTargetPeriod(e.target.value as GoalPeriod)} style={inputStyle}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
              </Field>
              <Field label="Direction" flex>
                <select value={direction} onChange={(e) => setDirection(e.target.value as GoalDirection)} style={inputStyle}>
                  <option value="above">Above target</option>
                  <option value="below">Below target</option>
                  <option value="exact">Exact target</option>
                </select>
              </Field>
            </div>
          </>
        )}

        <Field label="Metric Key (optional)">
          <input
            type="text"
            value={metricKey}
            onChange={(e) => setMetricKey(e.target.value)}
            placeholder="e.g., pipeline_value, emails_sent"
            style={inputStyle}
          />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
        <button onClick={handleSubmit} disabled={saving || !name.trim()} style={saveBtnStyle(saving || !name.trim())}>
          {saving ? "Saving..." : goal ? "Update" : "Create"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <div style={flex ? { flex: 1 } : undefined}>
      <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 4, display: "block" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function TypeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 6,
        border: active ? "1px solid var(--text-primary)" : "1px solid var(--border-default)",
        background: active ? "var(--accent-subtle)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  backgroundColor: "var(--bg-inset)",
  color: "var(--text-primary)",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 6,
  border: "1px solid var(--border-default)",
  background: "transparent",
  color: "var(--text-secondary)",
  fontSize: 13,
  cursor: "pointer",
};

const saveBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "8px 16px",
  borderRadius: 6,
  border: "none",
  background: disabled ? "var(--border-default)" : "var(--accent-emphasis)",
  color: disabled ? "var(--text-tertiary)" : "var(--text-on-accent)",
  fontSize: 13,
  fontWeight: 500,
  cursor: disabled ? "not-allowed" : "pointer",
});
