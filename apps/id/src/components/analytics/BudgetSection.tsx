"use client";

import { useState, useEffect } from "react";
import type { BudgetPacing } from "@/lib/oracle/budget-tracker";

export function BudgetSection() {
  const [pacing, setPacing] = useState<BudgetPacing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/oracle/budget")
      .then((res) => res.json())
      .then((data) => setPacing(data.data?.pacing ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ padding: 16, color: "var(--text-tertiary)", fontSize: 13 }}>Loading...</div>;
  }

  if (!pacing) {
    return (
      <div style={{ padding: 24, borderRadius: 8, border: "1px dashed var(--border-default)", background: "var(--bg-surface)", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>
          No active budget. Create one in Cortex Integrations.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, borderRadius: 8, border: "1px solid var(--border-muted)", background: "var(--bg-surface-raised)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>
            ${pacing.total_spent.toLocaleString()} / ${pacing.total_budget.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
            {pacing.days_remaining} days remaining
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "4px 10px",
            borderRadius: 6,
            alignSelf: "flex-start",
            background: pacing.on_pace ? "var(--success-muted)" : "var(--warning-muted)",
            color: pacing.on_pace ? "var(--success)" : "var(--warning)",
            textTransform: "uppercase",
          }}
        >
          {pacing.on_pace ? "On pace" : "Off pace"}
        </span>
      </div>

      {/* Pacing bar */}
      <div style={{ position: "relative", height: 8, borderRadius: 4, background: "var(--bg-inset)", marginBottom: 16 }}>
        <div
          style={{
            height: "100%",
            borderRadius: 4,
            background: pacing.on_pace ? "var(--success)" : "var(--warning)",
            width: `${Math.min(pacing.spend_percentage, 100)}%`,
          }}
        />
        {/* Time marker */}
        <div
          style={{
            position: "absolute",
            top: -2,
            left: `${pacing.pacing_percentage}%`,
            width: 2,
            height: 12,
            background: "var(--text-tertiary)",
            borderRadius: 1,
          }}
        />
      </div>

      {/* Allocations */}
      {pacing.allocations.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {pacing.allocations.map((alloc) => (
            <div key={alloc.category} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>{alloc.category}</span>
              <span style={{ color: alloc.pace_status === "over" ? "var(--error)" : "var(--text-tertiary)", fontFamily: "var(--font-mono), monospace" }}>
                ${alloc.spent.toLocaleString()} / ${alloc.allocated.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
