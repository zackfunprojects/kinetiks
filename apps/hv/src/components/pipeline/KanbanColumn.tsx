"use client";

import { useState } from "react";
import { DealCard } from "./DealCard";
import type { HvDeal, DealStage } from "@/types/pipeline";
import { formatCurrency } from "@/types/pipeline";

interface KanbanColumnProps {
  stage: DealStage;
  label: string;
  color: string;
  deals: HvDeal[];
  onDealClick: (dealId: string) => void;
  onDrop: (dealId: string, stage: DealStage) => void;
}

export function KanbanColumn({ stage, label, color, deals, onDealClick, onDrop }: KanbanColumnProps) {
  const [dragOver, setDragOver] = useState(false);

  // Aggregate by currency to avoid mixing amounts
  const totalsByCurrency: Record<string, number> = {};
  for (const d of deals) {
    if (d.value != null && d.value > 0) {
      const cur = d.currency ?? "USD";
      totalsByCurrency[cur] = (totalsByCurrency[cur] ?? 0) + d.value;
    }
  }
  const currencyEntries = Object.entries(totalsByCurrency);

  return (
    <div
      style={{
        flex: "0 0 260px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: dragOver ? "rgba(61,124,71,0.04)" : "transparent",
        borderRadius: "8px",
        border: dragOver ? "1px dashed var(--harvest-green)" : "1px solid transparent",
        transition: "background-color 0.15s, border-color 0.15s",
        minHeight: 200,
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const dealId = e.dataTransfer.getData("text/plain");
        if (dealId) onDrop(dealId, stage);
      }}
    >
      {/* Column header */}
      <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>
          {label}
        </span>
        <span
          style={{
            fontSize: "0.625rem",
            fontFamily: "var(--font-mono, monospace), monospace",
            color: "var(--text-tertiary)",
            padding: "1px 6px",
            backgroundColor: "var(--surface-raised)",
            borderRadius: "3px",
          }}
        >
          {deals.length}
        </span>
        {currencyEntries.length > 0 && (
          <span
            style={{
              fontSize: "0.625rem",
              fontFamily: "var(--font-mono, monospace), monospace",
              color: "var(--text-tertiary)",
            }}
          >
            {currencyEntries.map(([cur, sum]) => formatCurrency(sum, cur)).join(" / ")}
          </span>
        )}
      </div>

      {/* Cards */}
      <div
        style={{
          flex: 1,
          padding: "0 8px 8px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          overflowY: "auto",
        }}
      >
        {deals.length === 0 && (
          <div
            style={{
              padding: "20px 12px",
              textAlign: "center",
              fontSize: "0.6875rem",
              color: "var(--text-tertiary)",
              border: "1px dashed var(--border-subtle)",
              borderRadius: "6px",
            }}
          >
            No deals
          </div>
        )}
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} onClick={onDealClick} />
        ))}
      </div>
    </div>
  );
}
