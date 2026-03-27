"use client";

import { useState } from "react";
import type { OutreachGoal, GoalType, SalesMotion } from "@/types/outreach-goal";
import { DEFAULT_OUTREACH_GOAL } from "@/types/outreach-goal";

interface OutreachGoalStepProps {
  submitting: boolean;
  onComplete: (goal: OutreachGoal) => void;
}

const GOAL_TYPES: { value: GoalType; label: string; description: string; icon: string }[] = [
  { value: "booked_call", label: "Booked Call", description: "Prospect books a discovery call", icon: "📞" },
  { value: "demo_request", label: "Demo Request", description: "Prospect requests a product demo", icon: "🎬" },
  { value: "trial_signup", label: "Trial Signup", description: "Prospect signs up for a trial", icon: "🧪" },
  { value: "reply", label: "Get a Reply", description: "Start a conversation - no specific ask", icon: "💬" },
];

const SALES_MOTIONS: { value: SalesMotion; label: string; description: string }[] = [
  { value: "consultative", label: "Consultative", description: "Relationship-first. Multiple warm touches before asking." },
  { value: "direct", label: "Direct", description: "Shorter cycle. CTA appears earlier but still contextual." },
  { value: "enterprise", label: "Enterprise", description: "Long cycle. Heavy research, multi-threaded." },
  { value: "product_led", label: "Product-Led", description: "Let the product speak. Link to trial/demo earlier." },
];

export default function OutreachGoalStep({ submitting, onComplete }: OutreachGoalStepProps) {
  const [goal, setGoal] = useState<OutreachGoal>({ ...DEFAULT_OUTREACH_GOAL });

  function updateGoal(updates: Partial<OutreachGoal>) {
    setGoal((prev) => ({ ...prev, ...updates }));
  }

  function handleSubmit() {
    onComplete(goal);
  }

  return (
    <div>
      <div style={{ marginBottom: "var(--space-5)" }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          Outreach Goal
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
          What does success look like for your outreach? This shapes how AI writes your emails.
        </p>
      </div>

      {/* Goal type cards */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        <label style={{
          display: "block",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--text-secondary)",
          marginBottom: 8,
        }}>
          What counts as a conversion?
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {GOAL_TYPES.map((gt) => {
            const selected = goal.goal_type === gt.value;
            return (
              <button
                key={gt.value}
                onClick={() => updateGoal({ goal_type: gt.value, goal_label: gt.label })}
                style={{
                  padding: "var(--space-3)",
                  borderRadius: "var(--radius-md)",
                  border: selected
                    ? "1px solid var(--harvest-green)"
                    : "1px solid var(--border-default)",
                  backgroundColor: selected
                    ? "var(--harvest-green-subtle)"
                    : "var(--surface-base)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{gt.icon}</span>
                  <div>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: selected ? "var(--harvest-green)" : "var(--text-primary)",
                    }}>
                      {gt.label}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 1 }}>
                      {gt.description}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* CTA URL */}
      <div style={{ marginBottom: "var(--space-5)" }}>
        <label style={{
          display: "block",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--text-secondary)",
          marginBottom: 6,
        }}>
          CTA Link (optional)
        </label>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 6px" }}>
          Scheduling link, demo page, or signup URL to include in emails when appropriate.
        </p>
        <input
          type="url"
          value={goal.cta_url ?? ""}
          onChange={(e) => updateGoal({ cta_url: e.target.value || null })}
          placeholder="https://cal.com/yourname/30min"
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)",
            backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)",
            fontSize: 13,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Sales Motion */}
      <div style={{ marginBottom: "var(--space-5)" }}>
        <label style={{
          display: "block",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--text-secondary)",
          marginBottom: 8,
        }}>
          Sales Motion
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {SALES_MOTIONS.map((sm) => {
            const selected = goal.sales_motion === sm.value;
            return (
              <button
                key={sm.value}
                onClick={() => updateGoal({ sales_motion: sm.value })}
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  border: selected
                    ? "1px solid var(--harvest-green)"
                    : "1px solid var(--border-default)",
                  backgroundColor: selected
                    ? "var(--harvest-green-subtle)"
                    : "var(--surface-base)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: selected ? "var(--harvest-green)" : "var(--text-primary)",
                }}>
                  {sm.label}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                  {sm.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Continue button */}
      <div style={{ marginTop: "var(--space-6)", display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            padding: "10px 24px",
            borderRadius: "var(--radius-md)",
            border: "none",
            backgroundColor: "var(--harvest-green)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: submitting ? "not-allowed" : "pointer",
            transition: "all 0.2s",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "Saving..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
