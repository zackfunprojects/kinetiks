"use client";

import { useState, useEffect, useCallback } from "react";
import { PipelineMetrics } from "./PipelineMetrics";
import { PipelineKanban } from "./PipelineKanban";
import { PipelineTable } from "./PipelineTable";
import { CreateDealModal } from "./CreateDealModal";
import { CloseDealModal } from "./CloseDealModal";
import { DealDetailPanel } from "./DealDetailPanel";
import type { HvDeal, DealStage, PipelineMetrics as Metrics } from "@/types/pipeline";

type ViewMode = "kanban" | "table";

export function PipelineView() {
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [dealsByStage, setDealsByStage] = useState<Record<DealStage, HvDeal[]>>({
    prospecting: [], qualified: [], proposal: [], negotiation: [], closed_won: [], closed_lost: [],
  });
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [closingDeal, setClosingDeal] = useState<HvDeal | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);

  const fetchKanban = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hv/deals?view=kanban");
      const data = await res.json();
      if (data.success) {
        setDealsByStage(data.data.deals_by_stage);
        setMetrics(data.data.metrics);
      }
    } catch {
      console.error("Failed to fetch pipeline data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "kanban") fetchKanban();
  }, [viewMode, fetchKanban]);

  const handleStageChange = async (dealId: string, newStage: DealStage) => {
    // If dragging to a closed stage, open the close modal instead
    if (newStage === "closed_won" || newStage === "closed_lost") {
      // Find the deal in current state
      for (const deals of Object.values(dealsByStage)) {
        const deal = deals.find((d) => d.id === dealId);
        if (deal) {
          setClosingDeal(deal);
          return;
        }
      }
      return;
    }

    // Optimistic update
    setDealsByStage((prev) => {
      const updated = { ...prev };
      let movedDeal: HvDeal | undefined;

      // Remove from old stage
      for (const stage of Object.keys(updated) as DealStage[]) {
        const idx = updated[stage].findIndex((d) => d.id === dealId);
        if (idx >= 0) {
          movedDeal = { ...updated[stage][idx], stage: newStage };
          updated[stage] = [...updated[stage]];
          updated[stage].splice(idx, 1);
          break;
        }
      }

      // Add to new stage
      if (movedDeal) {
        updated[newStage] = [movedDeal, ...updated[newStage]];
      }

      return updated;
    });

    // API call
    try {
      await fetch(`/api/hv/deals/${dealId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
    } catch {
      // Revert on failure
      fetchKanban();
    }
  };

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    padding: "5px 12px",
    borderRadius: "4px",
    border: "none",
    backgroundColor: active ? "var(--surface-elevated)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-tertiary)",
    fontSize: "0.75rem",
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
  });

  return (
    <>
      {/* Header bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        {/* View toggle */}
        <div
          style={{
            display: "flex",
            gap: "2px",
            backgroundColor: "var(--surface-raised)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "6px",
            padding: "2px",
          }}
        >
          <button onClick={() => setViewMode("kanban")} style={toggleStyle(viewMode === "kanban")}>
            Board
          </button>
          <button onClick={() => setViewMode("table")} style={toggleStyle(viewMode === "table")}>
            Table
          </button>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: "7px 14px",
            borderRadius: "6px",
            border: "none",
            backgroundColor: "var(--accent-primary)",
            color: "#fff",
            fontSize: "0.8125rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Create deal
        </button>
      </div>

      <PipelineMetrics metrics={metrics} />

      {viewMode === "kanban" ? (
        loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-tertiary)" }}>Loading pipeline...</div>
        ) : (
          <PipelineKanban
            dealsByStage={dealsByStage}
            onDealClick={setSelectedDealId}
            onStageChange={handleStageChange}
          />
        )
      ) : (
        <PipelineTable onDealClick={setSelectedDealId} />
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateDealModal
          onCreated={() => { setShowCreateModal(false); fetchKanban(); }}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {closingDeal && (
        <CloseDealModal
          deal={closingDeal}
          onClosed={() => { setClosingDeal(null); fetchKanban(); }}
          onClose={() => setClosingDeal(null)}
        />
      )}

      {selectedDealId && (
        <DealDetailPanel
          dealId={selectedDealId}
          onClose={() => setSelectedDealId(null)}
          onDealUpdated={fetchKanban}
          onCloseDeal={(deal) => { setSelectedDealId(null); setClosingDeal(deal); }}
        />
      )}
    </>
  );
}
