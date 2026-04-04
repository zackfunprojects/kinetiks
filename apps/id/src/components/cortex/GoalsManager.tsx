"use client";

import { useState, useEffect, useCallback } from "react";
import type { Goal } from "@/lib/goals/types";
import { GoalCard } from "./GoalCard";
import { GoalEditor } from "./GoalEditor";

export function GoalsManager() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Goal | null | "new">(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch("/api/goals?status=all");
      if (!res.ok) throw new Error(`Failed to load goals (${res.status})`);
      const data = await res.json();
      setGoals(data.data?.goals ?? []);
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load goals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const handleSave = async (data: Record<string, unknown>) => {
    const method = data.id ? "PATCH" : "POST";
    try {
      const res = await fetch("/api/goals", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setEditing(null);
        fetchGoals();
      }
    } catch {
      // Keep editor open
    }
  };

  const handleArchive = async (goalId: string) => {
    try {
      await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: goalId, status: "archived" }),
      });
      fetchGoals();
    } catch {
      // Ignore
    }
  };

  const activeGoals = goals.filter((g) => g.status === "active" || g.status === "paused");
  const completedGoals = goals.filter((g) => g.status === "completed");
  const archivedGoals = goals.filter((g) => g.status === "archived");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Goals</h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "4px 0 0" }}>
            KPI targets and OKRs for your GTM system
          </p>
        </div>
        {editing === null && (
          <button
            onClick={() => setEditing("new")}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: "var(--accent-emphasis)",
              color: "var(--text-on-accent)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            + New goal
          </button>
        )}
      </div>

      {editing !== null && (
        <GoalEditor
          goal={editing === "new" ? null : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}

      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
          Loading goals...
        </div>
      ) : fetchError ? (
        <div style={{ padding: 24, borderRadius: 8, border: "1px dashed var(--error-muted)", background: "var(--bg-surface)", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "var(--error)", margin: 0 }}>{fetchError}</p>
        </div>
      ) : activeGoals.length === 0 && editing === null ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: 48,
            borderRadius: 8,
            border: "1px dashed var(--border-default)",
            background: "var(--bg-surface)",
          }}
        >
          <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: 0 }}>
            No active goals. Create one to start tracking your GTM performance.
          </p>
        </div>
      ) : (
        <>
          {activeGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={(g) => setEditing(g)}
              onArchive={handleArchive}
            />
          ))}

          {completedGoals.length > 0 && (
            <details style={{ marginTop: 24 }}>
              <summary style={{ fontSize: 13, color: "var(--success)", cursor: "pointer" }}>
                {completedGoals.length} completed goal{completedGoals.length !== 1 ? "s" : ""}
              </summary>
              <div style={{ marginTop: 8, opacity: 0.7 }}>
                {completedGoals.map((goal) => (
                  <GoalCard key={goal.id} goal={goal} onEdit={() => {}} onArchive={() => {}} />
                ))}
              </div>
            </details>
          )}

          {archivedGoals.length > 0 && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ fontSize: 13, color: "var(--text-tertiary)", cursor: "pointer" }}>
                {archivedGoals.length} archived goal{archivedGoals.length !== 1 ? "s" : ""}
              </summary>
              <div style={{ marginTop: 8, opacity: 0.5 }}>
                {archivedGoals.map((goal) => (
                  <GoalCard key={goal.id} goal={goal} onEdit={() => {}} onArchive={() => {}} />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
