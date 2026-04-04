"use client";

import { useState, useEffect, useCallback } from "react";
import type { Budget } from "@/lib/goals/types";

export function BudgetManager() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchBudgets = useCallback(async () => {
    try {
      const res = await fetch("/api/budgets");
      if (res.ok) {
        const data = await res.json();
        setBudgets(data.data?.budgets ?? []);
      }
    } catch {
      // Keep existing
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  const handleCreate = async () => {
    setCreating(true);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    try {
      await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          total_budget: 0,
          period: "monthly",
          period_start: monthStart.toISOString(),
          period_end: monthEnd.toISOString(),
          allocations: [],
        }),
      });
      fetchBudgets();
    } catch {
      // Ignore
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 16, color: "var(--text-tertiary)", fontSize: 13 }}>Loading budgets...</div>;
  }

  if (budgets.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          borderRadius: 8,
          border: "1px dashed var(--border-default)",
          background: "var(--bg-surface)",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "0 0 12px" }}>
          No budgets configured. Set up a budget to track GTM spend.
        </p>
        <button
          onClick={handleCreate}
          disabled={creating}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "1px solid var(--border-default)",
            background: "transparent",
            color: "var(--text-secondary)",
            fontSize: 12,
            cursor: creating ? "not-allowed" : "pointer",
          }}
        >
          {creating ? "Creating..." : "+ Create budget"}
        </button>
      </div>
    );
  }

  return (
    <div>
      {budgets.map((budget) => (
        <div
          key={budget.id}
          style={{
            padding: 16,
            borderRadius: 8,
            border: "1px solid var(--border-muted)",
            background: "var(--bg-surface-raised)",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
              {budget.currency} {budget.total_budget.toLocaleString()}
            </span>
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
              {budget.approval_status}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {budget.period} - {new Date(budget.period_start).toLocaleDateString()} to {new Date(budget.period_end).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
}
