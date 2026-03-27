"use client";

import { useState } from "react";
import type { HvSequence, SequenceStep, SequenceStatus } from "@/types/sequences";

interface SequenceDetailProps {
  sequence: HvSequence;
  onClose: () => void;
  onUpdated: () => void;
}

const STEP_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  email: { label: "Email", color: "var(--harvest-green)" },
  delay: { label: "Wait", color: "var(--harvest-amber)" },
  condition: { label: "Condition", color: "var(--harvest-soil)" },
};

export default function SequenceDetail({ sequence, onClose, onUpdated }: SequenceDetailProps) {
  const [steps, setSteps] = useState<SequenceStep[]>(
    Array.isArray(sequence.steps) ? sequence.steps : []
  );
  const [name, setName] = useState(sequence.name);
  const [status, setStatus] = useState<SequenceStatus>(sequence.status);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/hv/sequences/${sequence.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, steps, status }),
      });
      if (!res.ok) throw new Error(`Failed to save sequence: ${res.status}`);
      onUpdated();
    } catch (err) {
      console.error("Error saving sequence:", err);
    } finally {
      setSaving(false);
    }
  }

  function addStep(type: "email" | "delay" | "condition") {
    const newStep: SequenceStep = {
      id: crypto.randomUUID(),
      type,
      order: steps.length,
      ...(type === "email" ? { subject_line: "", template: "" } : {}),
      ...(type === "delay" ? { delay_days: 2 } : {}),
      ...(type === "condition" ? { condition_type: "replied", condition_action: "stop" } : {}),
    };
    setSteps([...steps, newStep]);
  }

  function removeStep(id: string) {
    setSteps(steps.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i })));
  }

  function updateStep(id: string, updates: Partial<SequenceStep>) {
    setSteps(steps.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }

  async function handleDelete() {
    if (!confirm("Delete this sequence? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/hv/sequences/${sequence.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to delete sequence: ${res.status}`);
      onUpdated();
    } catch (err) {
      console.error("Error deleting sequence:", err);
    }
  }

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 560, backgroundColor: "var(--surface-elevated)",
      borderLeft: "1px solid var(--border-subtle)", zIndex: 1000, overflowY: "auto", padding: 24,
      boxShadow: "var(--shadow-overlay)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: "100%", fontSize: 20, fontWeight: 700, color: "var(--text-primary)",
              backgroundColor: "transparent", border: "none", outline: "none", padding: 0,
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {(["draft", "active", "paused", "archived"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                style={{
                  padding: "4px 10px", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: status === s ? "1px solid var(--harvest-green)" : "1px solid var(--border-subtle)",
                  backgroundColor: status === s ? "rgba(61,124,71,0.08)" : "transparent",
                  color: status === s ? "var(--harvest-green)" : "var(--text-secondary)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <button onClick={onClose} style={{
          border: "none", background: "none", color: "var(--text-secondary)", fontSize: 20, cursor: "pointer",
        }}>x</button>
      </div>

      {/* Steps */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 12px" }}>
          Steps ({steps.length})
        </h3>

        {steps.map((step, idx) => {
          const typeInfo = STEP_TYPE_LABELS[step.type] ?? STEP_TYPE_LABELS.email;
          return (
            <div key={step.id} style={{
              padding: 16, borderRadius: 8, border: "1px solid var(--border-subtle)",
              marginBottom: 8, backgroundColor: "var(--surface-base)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)" }}>
                    {idx + 1}.
                  </span>
                  <span style={{
                    padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                    backgroundColor: `${typeInfo.color}20`, color: typeInfo.color,
                  }}>
                    {typeInfo.label}
                  </span>
                </div>
                <button
                  onClick={() => removeStep(step.id)}
                  style={{ border: "none", background: "none", color: "var(--text-tertiary)", fontSize: 14, cursor: "pointer" }}
                >
                  Remove
                </button>
              </div>

              {step.type === "email" && (
                <div>
                  <input
                    type="text"
                    placeholder="Subject line"
                    value={step.subject_line ?? ""}
                    onChange={(e) => updateStep(step.id, { subject_line: e.target.value })}
                    style={{
                      width: "100%", padding: "6px 10px", borderRadius: 4, fontSize: 13,
                      border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-raised)",
                      color: "var(--text-primary)", outline: "none", marginBottom: 6, boxSizing: "border-box",
                    }}
                  />
                  <textarea
                    placeholder="Email template body..."
                    value={step.template ?? ""}
                    onChange={(e) => updateStep(step.id, { template: e.target.value })}
                    rows={3}
                    style={{
                      width: "100%", padding: "6px 10px", borderRadius: 4, fontSize: 13,
                      border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-raised)",
                      color: "var(--text-primary)", outline: "none", resize: "vertical", boxSizing: "border-box",
                    }}
                  />
                </div>
              )}

              {step.type === "delay" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Wait</span>
                  <input
                    type="number"
                    min={1}
                    value={step.delay_days ?? 2}
                    onChange={(e) => updateStep(step.id, { delay_days: parseInt(e.target.value, 10) || 1 })}
                    style={{
                      width: 60, padding: "4px 8px", borderRadius: 4, fontSize: 13,
                      border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-raised)",
                      color: "var(--text-primary)", outline: "none", textAlign: "center",
                    }}
                  />
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>days before next step</span>
                </div>
              )}

              {step.type === "condition" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>If recipient</span>
                  <select
                    value={step.condition_type ?? "replied"}
                    onChange={(e) => updateStep(step.id, { condition_type: e.target.value as SequenceStep["condition_type"] })}
                    style={{
                      padding: "4px 8px", borderRadius: 4, fontSize: 13,
                      border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-raised)",
                      color: "var(--text-primary)", outline: "none",
                    }}
                  >
                    <option value="replied">replied</option>
                    <option value="opened">opened</option>
                    <option value="clicked">clicked</option>
                    <option value="bounced">bounced</option>
                  </select>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>then</span>
                  <select
                    value={step.condition_action ?? "stop"}
                    onChange={(e) => updateStep(step.id, { condition_action: e.target.value as SequenceStep["condition_action"] })}
                    style={{
                      padding: "4px 8px", borderRadius: 4, fontSize: 13,
                      border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-raised)",
                      color: "var(--text-primary)", outline: "none",
                    }}
                  >
                    <option value="stop">stop sequence</option>
                    <option value="skip">skip next step</option>
                  </select>
                </div>
              )}
            </div>
          );
        })}

        {/* Add step buttons */}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {(["email", "delay", "condition"] as const).map((type) => (
            <button
              key={type}
              onClick={() => addStep(type)}
              style={{
                padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer",
                border: "1px dashed var(--border-subtle)", backgroundColor: "transparent",
                color: "var(--text-secondary)",
              }}
            >
              + {STEP_TYPE_LABELS[type].label}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
        <button
          onClick={handleDelete}
          style={{
            padding: "8px 16px", borderRadius: 6, border: "1px solid var(--border-subtle)",
            backgroundColor: "transparent", color: "var(--error, #d44040)", fontSize: 13, cursor: "pointer",
          }}
        >
          Delete
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "8px 20px", borderRadius: 6, border: "none", cursor: "pointer",
            backgroundColor: "var(--harvest-green)", color: "#fff", fontSize: 13, fontWeight: 600,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
