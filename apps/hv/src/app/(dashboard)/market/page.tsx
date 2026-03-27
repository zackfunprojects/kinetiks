"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { PipelineMetrics as PipelineMetricsType } from "@/types/pipeline";
import { PipelineMetrics } from "@/components/pipeline/PipelineMetrics";

export default function MarketPage() {
  const [metrics, setMetrics] = useState<PipelineMetricsType | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/hv/deals?view=kanban");
        if (!res.ok) return;
        const json = await res.json();
        setMetrics(json.data?.metrics ?? null);
      } catch {
        console.error("[Market] Failed to load metrics");
      }
    }
    load();
  }, []);

  return (
    <div>
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h1 style={{
          fontSize: 22, fontWeight: 600, color: "var(--text-primary)",
          margin: 0, letterSpacing: "-0.02em",
        }}>
          Market
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
          Track your harvest - deals, outcomes, and yield.
        </p>
      </div>

      <PipelineMetrics metrics={metrics} />

      <div style={{
        display: "flex", gap: "var(--space-3)", marginTop: "var(--space-6)",
      }}>
        <Link
          href="/market/pipeline"
          style={{
            padding: "8px 16px", borderRadius: "var(--radius-md)",
            backgroundColor: "var(--harvest-green)", color: "#fff",
            textDecoration: "none", fontSize: 13, fontWeight: 500,
          }}
        >
          Open Harvest Board
        </Link>
        <Link
          href="/market/analytics"
          style={{
            padding: "8px 16px", borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)", color: "var(--text-secondary)",
            textDecoration: "none", fontSize: 13, fontWeight: 500,
            backgroundColor: "transparent",
          }}
        >
          View Yield
        </Link>
      </div>
    </div>
  );
}
