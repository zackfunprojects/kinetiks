"use client";

import type { PipelineMetrics as Metrics } from "@/types/pipeline";
import { formatCurrency } from "@/types/pipeline";

interface PipelineMetricsProps {
  metrics: Metrics | null;
}

export function PipelineMetrics({ metrics }: PipelineMetricsProps) {
  const cards = [
    { label: "Total Deals", value: metrics ? String(metrics.total_deals) : "-" },
    { label: "Pipeline Value", value: metrics ? formatCurrency(metrics.total_value) : "-" },
    { label: "Avg Deal Age", value: metrics ? `${metrics.avg_age_days}d` : "-" },
    { label: "Won This Month", value: metrics ? `${metrics.won_this_month.count} (${formatCurrency(metrics.won_this_month.value)})` : "-" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            backgroundColor: "var(--surface-raised)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "8px",
            padding: "16px",
          }}
        >
          <div
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "6px",
            }}
          >
            {card.label}
          </div>
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono, monospace), monospace",
            }}
          >
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
