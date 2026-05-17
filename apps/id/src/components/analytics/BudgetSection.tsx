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
    return <div style={{ padding: 16, color: "var(--kt-fg-3)", fontSize: 13 }}>Loading...</div>;
  }

  if (!pacing) {
    return (
      <div style={{ padding: 24, borderRadius: 8, border: "1px dashed var(--kt-border-1)", background: "var(--kt-bg-subtle)", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "var(--kt-fg-3)", margin: 0 }}>
          No active budget. Create one in Cortex Integrations.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, borderRadius: 8, border: "1px solid var(--kt-border-2)", background: "var(--kt-bg-muted)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "var(--kt-fg-1)" }}>
            ${pacing.total_spent.toLocaleString()} / ${pacing.total_budget.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: "var(--kt-fg-3)", marginTop: 2 }}>
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
            background: pacing.on_pace ? "var(--kt-success-soft)" : "var(--kt-warning-soft)",
            color: pacing.on_pace ? "var(--kt-success)" : "var(--kt-warning)",
            textTransform: "uppercase",
          }}
        >
          {pacing.on_pace ? "On pace" : "Off pace"}
        </span>
      </div>

      {/* Pacing bar */}
      <div style={{ position: "relative", height: 8, borderRadius: 4, background: "var(--kt-bg-base)", marginBottom: 16 }}>
        <div
          style={{
            height: "100%",
            borderRadius: 4,
            background: pacing.on_pace ? "var(--kt-success)" : "var(--kt-warning)",
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
            background: "var(--kt-fg-3)",
            borderRadius: 1,
          }}
        />
      </div>

      {/* Allocations */}
      {pacing.allocations.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {pacing.allocations.map((alloc) => (
            <div key={alloc.category} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--kt-fg-2)" }}>{alloc.category}</span>
              <span style={{ color: alloc.pace_status === "over" ? "var(--kt-danger)" : "var(--kt-fg-3)", fontFamily: "var(--font-mono), monospace" }}>
                ${alloc.spent.toLocaleString()} / ${alloc.allocated.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
