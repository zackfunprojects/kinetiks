"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Input, Button, Pill, ProgressBar, AsyncSection } from "@kinetiks/ui";
import type { Budget, BudgetAllocation } from "@/lib/goals/types";

type BudgetWithAllocations = Budget & { kinetiks_budget_allocations?: BudgetAllocation[] };

function usd(currency: string, n: number): string {
  return `${currency} ${Math.round(n).toLocaleString()}`;
}
function toDateInput(iso: string): string {
  return iso ? iso.slice(0, 10) : "";
}

export function BudgetManager() {
  const [budgets, setBudgets] = useState<BudgetWithAllocations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BudgetWithAllocations | "new" | null>(null);

  const fetchBudgets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/budgets");
      if (!res.ok) throw new Error(`Failed to load budgets (${res.status})`);
      const data = await res.json();
      setBudgets(data.data?.budgets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load budgets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  const handleDelete = async (id: string) => {
    await fetch(`/api/budgets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    fetchBudgets();
  };

  const handleSaved = () => {
    setEditing(null);
    fetchBudgets();
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--kt-s-4)" }}>
        <div>
          <h1 className="kt-page-title" style={{ margin: 0 }}>Budget</h1>
          <p className="kt-body" style={{ margin: "var(--kt-s-1) 0 0" }}>Spend envelopes the system operates within</p>
        </div>
        {editing === null ? <Button variant="accent" onClick={() => setEditing("new")}>+ New budget</Button> : null}
      </div>

      {editing !== null ? (
        <BudgetForm budget={editing === "new" ? null : editing} onSaved={handleSaved} onCancel={() => setEditing(null)} />
      ) : null}

      <AsyncSection
        loading={loading}
        error={error}
        isEmpty={budgets.length === 0 && editing === null}
        onRetry={fetchBudgets}
        errorTitle="We couldn't load your budgets."
        emptyTitle="No budgets configured. Create one to set the spend the system can operate within."
      >
        {budgets.map((budget) => (
          <BudgetCard key={budget.id} budget={budget} onEdit={() => setEditing(budget)} onDelete={() => handleDelete(budget.id)} />
        ))}
      </AsyncSection>
    </div>
  );
}

function BudgetCard({ budget, onEdit, onDelete }: { budget: BudgetWithAllocations; onEdit: () => void; onDelete: () => void }) {
  const allocations = budget.kinetiks_budget_allocations ?? [];
  const approvalTone = budget.approval_status === "approved" ? "success" : budget.approval_status === "rejected" ? "danger" : "warning";
  return (
    <Card style={{ marginBottom: "var(--kt-s-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--kt-s-2)" }}>
        <div>
          <div className="kt-data-large">{usd(budget.currency, budget.total_budget)}</div>
          <div className="kt-small" style={{ marginTop: "var(--kt-s-1)" }}>
            {budget.period} · {new Date(budget.period_start).toLocaleDateString()} – {new Date(budget.period_end).toLocaleDateString()}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--kt-s-1)" }}>
          <Pill tone={approvalTone}>{budget.approval_status}</Pill>
          <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
          <Button variant="danger" size="sm" onClick={onDelete}>Delete</Button>
        </div>
      </div>

      {allocations.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--kt-s-2)", marginTop: "var(--kt-s-3)" }}>
          {allocations.map((a) => {
            const frac = a.allocated_amount > 0 ? a.spent_amount / a.allocated_amount : 0;
            const over = frac > 1;
            return (
              <div key={a.id}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--kt-s-1)" }}>
                  <span className="kt-small">{a.category}</span>
                  <span className="kt-data-inline" style={{ color: over ? "var(--kt-danger)" : "var(--kt-fg-2)" }}>
                    {usd(budget.currency, a.spent_amount)} / {usd(budget.currency, a.allocated_amount)}
                  </span>
                </div>
                <ProgressBar value={Math.min(frac, 1)} tone={over ? "danger" : "accent"} height={4} ariaLabel={`${a.category} spend`} />
              </div>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}

const PERIODS = ["weekly", "monthly", "quarterly", "annual"];

function BudgetForm({ budget, onSaved, onCancel }: { budget: BudgetWithAllocations | null; onSaved: () => void; onCancel: () => void }) {
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [total, setTotal] = useState(budget ? String(budget.total_budget) : "");
  const [currency, setCurrency] = useState(budget?.currency ?? "USD");
  const [period, setPeriod] = useState(budget?.period ?? "monthly");
  const [start, setStart] = useState(toDateInput(budget?.period_start ?? defaultStart.toISOString()));
  const [end, setEnd] = useState(toDateInput(budget?.period_end ?? defaultEnd.toISOString()));
  const [allocations, setAllocations] = useState<{ category: string; allocated_amount: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    const totalNum = parseFloat(total);
    if (!Number.isFinite(totalNum) || totalNum < 0) {
      setFormError("Enter a valid budget amount.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload: Record<string, unknown> = {
        total_budget: totalNum,
        currency,
        period,
        period_start: new Date(start).toISOString(),
        period_end: new Date(end).toISOString(),
      };
      let res: Response;
      if (budget) {
        res = await fetch("/api/budgets", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: budget.id, ...payload }),
        });
      } else {
        payload.allocations = allocations
          .filter((a) => a.category.trim() && a.allocated_amount)
          .map((a) => ({ category: a.category.trim(), allocated_amount: parseFloat(a.allocated_amount) }));
        res = await fetch("/api/budgets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) throw new Error("Save failed");
      onSaved();
    } catch {
      setFormError("We couldn't save that budget. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card variant="muted" style={{ marginBottom: "var(--kt-s-4)" }}>
      <h3 className="kt-section-title" style={{ margin: "0 0 var(--kt-s-4)" }}>{budget ? "Edit budget" : "New budget"}</h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--kt-s-3)" }}>
        <div style={{ display: "flex", gap: "var(--kt-s-3)" }}>
          <div style={{ flex: 2 }}>
            <label className="kt-label" htmlFor="b-total">Total budget</label>
            <Input id="b-total" type="number" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="5000" />
          </div>
          <div style={{ flex: 1 }}>
            <label className="kt-label" htmlFor="b-currency">Currency</label>
            <Input id="b-currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          </div>
        </div>

        <div style={{ display: "flex", gap: "var(--kt-s-3)" }}>
          <div style={{ flex: 1 }}>
            <label className="kt-label" htmlFor="b-period">Period</label>
            <select id="b-period" className="kt-field" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="kt-label" htmlFor="b-start">Start</label>
            <Input id="b-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="kt-label" htmlFor="b-end">End</label>
            <Input id="b-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        {!budget ? (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--kt-s-1)" }}>
              <span className="kt-label" style={{ margin: 0 }}>Allocations (optional)</span>
              <Button variant="ghost" size="sm" onClick={() => setAllocations((a) => [...a, { category: "", allocated_amount: "" }])}>+ Add</Button>
            </div>
            {allocations.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: "var(--kt-s-2)", marginBottom: "var(--kt-s-2)" }}>
                <Input placeholder="Category (e.g. Paid ads)" value={a.category} onChange={(e) => setAllocations((prev) => prev.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))} />
                <Input type="number" placeholder="Amount" value={a.allocated_amount} onChange={(e) => setAllocations((prev) => prev.map((x, j) => (j === i ? { ...x, allocated_amount: e.target.value } : x)))} />
                <Button variant="ghost" size="sm" onClick={() => setAllocations((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove allocation">×</Button>
              </div>
            ))}
          </div>
        ) : null}

        {formError ? <p className="kt-helper kt-helper--error" style={{ margin: 0 }}>{formError}</p> : null}
      </div>

      <div style={{ display: "flex", gap: "var(--kt-s-2)", justifyContent: "flex-end", marginTop: "var(--kt-s-4)" }}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="accent" onClick={submit} loading={saving}>{budget ? "Update" : "Create"}</Button>
      </div>
    </Card>
  );
}
