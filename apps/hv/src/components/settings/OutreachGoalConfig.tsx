"use client";

import { useState, useEffect } from "react";
import type { OutreachGoal, GoalType, SalesMotion } from "@/types/outreach-goal";
import { DEFAULT_OUTREACH_GOAL } from "@/types/outreach-goal";

const GOAL_TYPES: { value: GoalType; label: string; description: string }[] = [
  { value: "booked_call", label: "Booked Call", description: "Prospect books a call via scheduling link" },
  { value: "demo_request", label: "Demo Request", description: "Prospect requests a product demo" },
  { value: "trial_signup", label: "Trial Signup", description: "Prospect signs up for a trial" },
  { value: "reply", label: "Get a Reply", description: "Start a conversation - no specific ask" },
  { value: "form_submission", label: "Form Submission", description: "Prospect fills out a form on your site" },
  { value: "purchase", label: "Purchase", description: "Direct purchase or signup" },
];

const SALES_MOTIONS: { value: SalesMotion; label: string; description: string }[] = [
  { value: "consultative", label: "Consultative", description: "Relationship-first. Multiple warm touches before asking." },
  { value: "direct", label: "Direct", description: "Shorter cycle. CTA appears earlier but still contextual." },
  { value: "enterprise", label: "Enterprise", description: "Long cycle. Heavy research, multi-threaded, no CTA until deep engagement." },
  { value: "product_led", label: "Product-Led", description: "Let the product speak. Link to trial/demo earlier." },
];

export default function OutreachGoalConfig() {
  const [goal, setGoal] = useState<OutreachGoal>(DEFAULT_OUTREACH_GOAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/hv/outreach-goal");
        if (res.ok) {
          const json = await res.json();
          if (json.data) setGoal(json.data);
        }
      } catch (err) {
        console.error("Failed to load outreach goal:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/hv/outreach-goal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(goal),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error("Failed to save outreach goal:", err);
    } finally {
      setSaving(false);
    }
  }

  function updateGoal(updates: Partial<OutreachGoal>) {
    setGoal((prev) => ({ ...prev, ...updates }));
  }

  function updateRules(updates: Partial<OutreachGoal["rules"]>) {
    setGoal((prev) => ({ ...prev, rules: { ...prev.rules, ...updates } }));
  }

  if (loading) {
    return <div style={{ color: "var(--text-tertiary)", fontSize: 13, padding: 20 }}>Loading...</div>;
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Goal Type */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>
          What is your outreach goal?
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "0 0 var(--space-3)" }}>
          This determines what your AI-generated emails and calls optimize for.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {GOAL_TYPES.map((gt) => (
            <button
              key={gt.value}
              onClick={() => updateGoal({ goal_type: gt.value, goal_label: gt.label })}
              style={{
                padding: "var(--space-3)",
                borderRadius: "var(--radius-md)",
                border: goal.goal_type === gt.value
                  ? "1px solid var(--harvest-green)"
                  : "1px solid var(--border-default)",
                backgroundColor: goal.goal_type === gt.value
                  ? "var(--harvest-green-subtle)"
                  : "var(--surface-elevated)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{
                fontSize: 13, fontWeight: 500,
                color: goal.goal_type === gt.value ? "var(--harvest-green)" : "var(--text-primary)",
              }}>
                {gt.label}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                {gt.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* CTA URL */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>
          CTA Link
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "0 0 var(--space-3)" }}>
          The link included in emails when a CTA is appropriate (e.g. cal.com scheduling link, demo page).
        </p>
        <input
          type="url"
          value={goal.cta_url ?? ""}
          onChange={(e) => updateGoal({ cta_url: e.target.value || null })}
          placeholder="https://cal.com/yourname/30min"
          style={{
            width: "100%", padding: "8px 12px", borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", fontSize: 13, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* CTA Copy */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          CTA Phrasing (optional - AI will generate if blank)
        </label>
        <input
          type="text"
          value={goal.cta_copy ?? ""}
          onChange={(e) => updateGoal({ cta_copy: e.target.value || null })}
          placeholder='e.g. "Grab 15 minutes on my calendar"'
          style={{
            width: "100%", padding: "8px 12px", borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", fontSize: 13, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Sales Motion */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>
          Sales Motion
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "0 0 var(--space-3)" }}>
          Controls how aggressively the AI pushes toward your goal. Conservative motions build relationships first.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SALES_MOTIONS.map((sm) => (
            <button
              key={sm.value}
              onClick={() => updateGoal({ sales_motion: sm.value })}
              style={{
                padding: "var(--space-3)",
                borderRadius: "var(--radius-md)",
                border: goal.sales_motion === sm.value
                  ? "1px solid var(--harvest-green)"
                  : "1px solid var(--border-default)",
                backgroundColor: goal.sales_motion === sm.value
                  ? "var(--harvest-green-subtle)"
                  : "var(--surface-elevated)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{
                fontSize: 13, fontWeight: 500,
                color: goal.sales_motion === sm.value ? "var(--harvest-green)" : "var(--text-primary)",
              }}>
                {sm.label}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                {sm.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Rules */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>
          Outreach Rules
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "0 0 var(--space-3)" }}>
          Fine-tune when and how the CTA appears in your outreach.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {/* Cold no CTA touches */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                Warm-up emails before CTA
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                Number of value-only emails before including a CTA link
              </div>
            </div>
            <input
              type="number"
              min={0}
              max={5}
              value={goal.rules.cold_no_cta_touches}
              onChange={(e) => updateRules({ cold_no_cta_touches: parseInt(e.target.value, 10) || 0 })}
              style={{
                width: 60, padding: "6px 8px", borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)", backgroundColor: "var(--surface-base)",
                color: "var(--text-primary)", fontSize: 13, textAlign: "center", outline: "none",
              }}
            />
          </div>

          {/* Require engagement */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                Require engagement before CTA
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                Only include CTA after prospect has opened or replied
              </div>
            </div>
            <button
              onClick={() => updateRules({ require_engagement_for_cta: !goal.rules.require_engagement_for_cta })}
              style={{
                width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                backgroundColor: goal.rules.require_engagement_for_cta ? "var(--harvest-green)" : "var(--border-strong)",
                position: "relative", transition: "background-color 0.2s",
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: "50%", backgroundColor: "#fff",
                position: "absolute", top: 3,
                left: goal.rules.require_engagement_for_cta ? 23 : 3,
                transition: "left 0.2s",
              }} />
            </button>
          </div>

          {/* Breakup after */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                Breakup email after
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                Send graceful exit email after this many unanswered touches
              </div>
            </div>
            <input
              type="number"
              min={3}
              max={10}
              value={goal.rules.breakup_after_touches}
              onChange={(e) => updateRules({ breakup_after_touches: parseInt(e.target.value, 10) || 5 })}
              style={{
                width: 60, padding: "6px 8px", borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)", backgroundColor: "var(--surface-base)",
                color: "var(--text-primary)", fontSize: 13, textAlign: "center", outline: "none",
              }}
            />
          </div>
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: "8px 20px", borderRadius: "var(--radius-md)",
          border: "none", cursor: saving ? "not-allowed" : "pointer",
          backgroundColor: saved ? "var(--success)" : "var(--harvest-green)",
          color: "#fff", fontSize: 13, fontWeight: 600,
          transition: "all 0.2s",
        }}
      >
        {saving ? "Saving..." : saved ? "Saved" : "Save Outreach Goal"}
      </button>
    </div>
  );
}
