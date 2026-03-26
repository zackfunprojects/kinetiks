"use client";

import type { HvDeal } from "@/types/pipeline";
import { formatCurrency, getDealAge } from "@/types/pipeline";

interface DealCardProps {
  deal: HvDeal;
  onClick: (dealId: string) => void;
}

export function DealCard({ deal, onClick }: DealCardProps) {
  const contactName = deal.contact
    ? [deal.contact.first_name, deal.contact.last_name].filter(Boolean).join(" ")
    : null;
  const age = getDealAge(deal.created_at);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", deal.id);
        e.dataTransfer.effectAllowed = "move";
        (e.currentTarget as HTMLElement).style.opacity = "0.5";
      }}
      onDragEnd={(e) => {
        (e.currentTarget as HTMLElement).style.opacity = "1";
      }}
      onClick={() => onClick(deal.id)}
      style={{
        backgroundColor: "var(--surface-elevated, #242420)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "6px",
        padding: "10px 12px",
        cursor: "grab",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)"; }}
    >
      <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-primary)", marginBottom: "4px" }}>
        {deal.name}
      </div>

      {contactName && (
        <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginBottom: "2px" }}>
          {contactName}
        </div>
      )}

      {deal.organization?.name && (
        <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>
          {deal.organization.name}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
        {deal.value != null && (
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              fontFamily: "var(--font-mono, monospace), monospace",
              color: "var(--text-primary)",
            }}
          >
            {formatCurrency(deal.value, deal.currency)}
          </span>
        )}
        <span
          style={{
            fontSize: "0.625rem",
            padding: "1px 6px",
            borderRadius: "3px",
            backgroundColor: "var(--surface-raised)",
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-mono, monospace), monospace",
          }}
        >
          {age}d
        </span>
      </div>
    </div>
  );
}
