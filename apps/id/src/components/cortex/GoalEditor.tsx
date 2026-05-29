"use client";

import { useMemo, useState } from "react";
import { Card, Input, Button } from "@kinetiks/ui";
import type { Goal, GoalType, GoalPeriod, GoalDirection } from "@/lib/goals/types";
import { METRIC_REGISTRY } from "@/lib/oracle/metric-schema";

interface GoalEditorProps {
  goal?: Goal | null;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}

const fieldLabel = "kt-label";

export function GoalEditor({ goal, onSave, onCancel }: GoalEditorProps) {
  const [name, setName] = useState(goal?.name ?? "");
  const [type, setType] = useState<GoalType>(goal?.type ?? "kpi_target");
  const [targetValue, setTargetValue] = useState(goal?.target_value?.toString() ?? "");
  const [targetPeriod, setTargetPeriod] = useState<GoalPeriod>(goal?.target_period ?? "monthly");
  const [direction, setDirection] = useState<GoalDirection>(goal?.direction ?? "above");
  const [metricKey, setMetricKey] = useState(goal?.metric_key ?? "");
  const [saving, setSaving] = useState(false);

  // Group registered metrics by source app so the picker prevents typos
  // (was a free-text input). "" = manual goal with no bound metric.
  const metricsByApp = useMemo(() => {
    const out: Record<string, { key: string; name: string }[]> = {};
    for (const m of METRIC_REGISTRY) {
      (out[m.source_app] ??= []).push({ key: m.key, name: m.name });
    }
    return out;
  }, []);

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
    await onSave(data);
    setSaving(false);
  };

  return (
    <Card variant="muted" style={{ marginBottom: "var(--kt-s-4)" }}>
      <h3 className="kt-section-title" style={{ margin: "0 0 var(--kt-s-4)" }}>
        {goal ? "Edit goal" : "New goal"}
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--kt-s-3)" }}>
        <div>
          <label className={fieldLabel} htmlFor="goal-name">Name</label>
          <Input
            id="goal-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Monthly pipeline growth"
            autoFocus
          />
        </div>

        <div>
          <span className={fieldLabel}>Type</span>
          <div style={{ display: "flex", gap: "var(--kt-s-2)" }}>
            <TypeButton label="KPI target" active={type === "kpi_target"} onClick={() => setType("kpi_target")} />
            <TypeButton label="OKR" active={type === "okr"} onClick={() => setType("okr")} />
          </div>
        </div>

        <div>
          <label className={fieldLabel} htmlFor="goal-metric">Tracked metric</label>
          <select
            id="goal-metric"
            className="kt-field"
            value={metricKey}
            onChange={(e) => setMetricKey(e.target.value)}
          >
            <option value="">None (manual entry)</option>
            {Object.entries(metricsByApp).map(([app, metrics]) => (
              <optgroup key={app} label={app}>
                {metrics.map((m) => (
                  <option key={m.key} value={m.key}>{m.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="kt-helper">Binding a metric lets the Oracle track progress automatically.</span>
        </div>

        <div>
          <label className={fieldLabel} htmlFor="goal-target">Target value</label>
          <Input
            id="goal-target"
            type="number"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            placeholder="100"
          />
        </div>

        <div style={{ display: "flex", gap: "var(--kt-s-3)" }}>
          <div style={{ flex: 1 }}>
            <label className={fieldLabel} htmlFor="goal-period">Period</label>
            <select id="goal-period" className="kt-field" value={targetPeriod} onChange={(e) => setTargetPeriod(e.target.value as GoalPeriod)}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className={fieldLabel} htmlFor="goal-direction">Direction</label>
            <select id="goal-direction" className="kt-field" value={direction} onChange={(e) => setDirection(e.target.value as GoalDirection)}>
              <option value="above">Above target</option>
              <option value="below">Below target</option>
              <option value="exact">Exact target</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--kt-s-2)", justifyContent: "flex-end", marginTop: "var(--kt-s-4)" }}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="accent" onClick={handleSubmit} loading={saving} disabled={!name.trim()}>
          {goal ? "Update" : "Create"}
        </Button>
      </div>
    </Card>
  );
}

function TypeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "var(--kt-s-2) var(--kt-s-4)",
        borderRadius: "var(--kt-radius-1)",
        border: active ? "1px solid var(--kt-accent)" : "1px solid var(--kt-border-2)",
        background: active ? "var(--kt-accent-soft)" : "transparent",
        color: "var(--kt-fg-1)",
        fontSize: "var(--kt-fs-13)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
