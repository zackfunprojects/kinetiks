"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, ProgressBar, StatusPill, AsyncSection } from "@kinetiks/ui";
import type { BudgetPacing } from "@/lib/oracle/budget-tracker";

function usd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function BudgetSection() {
  const [pacing, setPacing] = useState<BudgetPacing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/oracle/budget")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setPacing(data.data?.pacing ?? null))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load budget"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AsyncSection
      loading={loading}
      error={error}
      isEmpty={!pacing}
      onRetry={load}
      errorTitle="We couldn't load your budget."
      emptyFallback={
        <Card variant="muted">
          <div className="kt-body">No active budget. Create one in Cortex to track spend pacing here.</div>
        </Card>
      }
    >
      {pacing ? <BudgetCard pacing={pacing} /> : null}
    </AsyncSection>
  );
}

function BudgetCard({ pacing }: { pacing: BudgetPacing }) {
  const onPace = pacing.on_pace;
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--kt-s-3)" }}>
        <div>
          <div className="kt-data-large">
            {usd(pacing.total_spent)} <span className="kt-small">/ {usd(pacing.total_budget)}</span>
          </div>
          <div className="kt-small" style={{ marginTop: "var(--kt-s-1)" }}>
            {pacing.days_remaining} days remaining
          </div>
        </div>
        <StatusPill tone={onPace ? "success" : "warning"}>{onPace ? "On pace" : "Off pace"}</StatusPill>
      </div>

      <ProgressBar
        value={pacing.spend_percentage / 100}
        tone={onPace ? "success" : "warning"}
        height={8}
        tickAt={pacing.pacing_percentage / 100}
        ariaLabel={`Spent ${pacing.spend_percentage.toFixed(0)} percent of budget; ${pacing.pacing_percentage.toFixed(0)} percent of the period has elapsed`}
      />

      {pacing.allocations.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--kt-s-1)", marginTop: "var(--kt-s-4)" }}>
          {pacing.allocations.map((alloc) => (
            <div key={alloc.category} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="kt-small">{alloc.category}</span>
              <span
                className="kt-data-inline"
                style={{ color: alloc.pace_status === "over" ? "var(--kt-danger)" : "var(--kt-fg-2)" }}
              >
                {usd(alloc.spent)} / {usd(alloc.allocated)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
