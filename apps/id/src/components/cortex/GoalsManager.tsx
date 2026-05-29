"use client";

import { useState, useEffect, useCallback } from "react";
import { Button, AsyncSection } from "@kinetiks/ui";
import type { Goal, GoalStatus } from "@/lib/goals/types";
import type { GoalProgressView } from "@/lib/oracle/goal-view";
import { GoalCard } from "./GoalCard";
import { GoalEditor } from "./GoalEditor";

export function GoalsManager() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [progress, setProgress] = useState<Record<string, GoalProgressView>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Goal | null | "new">(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [goalsRes, progressRes] = await Promise.all([
        fetch("/api/goals?status=all"),
        fetch("/api/oracle/goals"),
      ]);
      if (!goalsRes.ok) throw new Error(`Failed to load goals (${goalsRes.status})`);
      const goalsData = await goalsRes.json();
      setGoals(goalsData.data?.goals ?? []);

      if (progressRes.ok) {
        const progressData = await progressRes.json();
        const map: Record<string, GoalProgressView> = {};
        for (const p of (progressData.data?.goals ?? []) as GoalProgressView[]) {
          map[p.goal_id] = p;
        }
        setProgress(map);
      }
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
    const res = await fetch("/api/goals", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setEditing(null);
      fetchGoals();
    }
  };

  const handleStatusChange = async (goalId: string, status: GoalStatus) => {
    await fetch("/api/goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: goalId, status }),
    });
    fetchGoals();
  };

  const activeGoals = goals.filter((g) => g.status === "active" || g.status === "paused");
  const completedGoals = goals.filter((g) => g.status === "completed");
  const archivedGoals = goals.filter((g) => g.status === "archived");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--kt-s-4)" }}>
        <div>
          <h1 className="kt-page-title" style={{ margin: 0 }}>Goals</h1>
          <p className="kt-body" style={{ margin: "var(--kt-s-1) 0 0" }}>KPI targets and OKRs for your GTM system</p>
        </div>
        {editing === null ? (
          <Button variant="accent" onClick={() => setEditing("new")}>+ New goal</Button>
        ) : null}
      </div>

      {editing !== null ? (
        <GoalEditor goal={editing === "new" ? null : editing} onSave={handleSave} onCancel={() => setEditing(null)} />
      ) : null}

      <AsyncSection
        loading={loading}
        error={fetchError}
        isEmpty={activeGoals.length === 0 && editing === null && completedGoals.length === 0 && archivedGoals.length === 0}
        onRetry={fetchGoals}
        errorTitle="We couldn't load your goals."
        emptyTitle="No goals yet. Create one to start tracking your GTM performance."
      >
        {activeGoals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            progress={progress[goal.id]}
            onEdit={(g) => setEditing(g)}
            onStatusChange={handleStatusChange}
          />
        ))}

        {completedGoals.length > 0 ? (
          <details style={{ marginTop: "var(--kt-s-5)" }}>
            <summary className="kt-small" style={{ color: "var(--kt-success)", cursor: "pointer" }}>
              {completedGoals.length} completed goal{completedGoals.length !== 1 ? "s" : ""}
            </summary>
            <div style={{ marginTop: "var(--kt-s-2)" }}>
              {completedGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} progress={progress[goal.id]} onEdit={() => {}} onStatusChange={handleStatusChange} readOnly />
              ))}
            </div>
          </details>
        ) : null}

        {archivedGoals.length > 0 ? (
          <details style={{ marginTop: "var(--kt-s-4)" }}>
            <summary className="kt-small" style={{ cursor: "pointer" }}>
              {archivedGoals.length} archived goal{archivedGoals.length !== 1 ? "s" : ""}
            </summary>
            <div style={{ marginTop: "var(--kt-s-2)", opacity: 0.6 }}>
              {archivedGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} onEdit={() => {}} onStatusChange={handleStatusChange} readOnly />
              ))}
            </div>
          </details>
        ) : null}
      </AsyncSection>
    </div>
  );
}
