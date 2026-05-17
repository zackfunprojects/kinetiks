"use client";

import { useEffect, useMemo, useState } from "react";

import { InsightCard, type InsightCardData } from "./InsightCard";
import { InsightFilters, type SeverityFilter } from "./InsightFilters";
import { InsightSkeleton } from "./InsightSkeleton";

const SEVERITY_RANK: Record<InsightCardData["severity"], number> = {
  info: 0,
  notable: 1,
  urgent: 2,
};

export function InsightsBoard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<InsightCardData[]>([]);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string | "all">("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/oracle/insights?limit=50")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((body: { data?: { insights?: InsightCardData[] } }) => {
        if (cancelled) return;
        setInsights(body.data?.insights ?? []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load insights");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const availableSources = useMemo(
    () => Array.from(new Set(insights.map((i) => i.source_app))).sort(),
    [insights]
  );

  const filtered = useMemo(() => {
    let out = insights;
    if (severityFilter === "notable_plus") {
      out = out.filter((i) => SEVERITY_RANK[i.severity] >= SEVERITY_RANK.notable);
    } else if (severityFilter === "urgent_only") {
      out = out.filter((i) => i.severity === "urgent");
    }
    if (sourceFilter !== "all") {
      out = out.filter((i) => i.source_app === sourceFilter);
    }
    return out;
  }, [insights, severityFilter, sourceFilter]);

  const grouped = useMemo(() => {
    const order: Array<InsightCardData["severity"]> = ["urgent", "notable", "info"];
    return order.map((sev) => ({
      severity: sev,
      items: filtered.filter((i) => i.severity === sev),
    }));
  }, [filtered]);

  const handleDismiss = (id: string) => {
    setInsights((prev) => prev.filter((i) => i.insight_id !== id));
  };
  const handleActedOn = (id: string) => {
    setInsights((prev) =>
      prev.map((i) => (i.insight_id === id ? { ...i, acted_on: true } : i))
    );
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0, fontSize: 18, color: "var(--kt-fg-0)" }}>Insights</h2>
        <span style={{ fontSize: 12, color: "var(--kt-fg-3)" }}>
          {loading ? "" : `${filtered.length} of ${insights.length}`}
        </span>
      </header>

      {!loading && !error && insights.length > 0 && (
        <InsightFilters
          severity={severityFilter}
          onSeverityChange={setSeverityFilter}
          sourceApp={sourceFilter}
          availableSources={availableSources}
          onSourceChange={setSourceFilter}
        />
      )}

      {loading ? (
        <InsightSkeleton />
      ) : error ? (
        <div
          role="alert"
          style={{
            padding: 16,
            borderRadius: "var(--kt-radius-2, 8px)",
            border: "1px solid var(--kt-danger, var(--kt-border-1))",
            background: "var(--kt-danger-soft, var(--kt-bg-2))",
            color: "var(--kt-danger, var(--kt-fg-1))",
            fontSize: 13,
          }}
        >
          Failed to load insights: {error}
        </div>
      ) : insights.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <FilteredEmptyState
          onReset={() => {
            setSeverityFilter("all");
            setSourceFilter("all");
          }}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {grouped.map((g) =>
            g.items.length === 0 ? null : (
              <div
                key={g.severity}
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <h3 style={{ margin: 0, fontSize: 13, color: "var(--kt-fg-3)" }}>
                  {g.severity[0]!.toUpperCase() + g.severity.slice(1)} (
                  {g.items.length})
                </h3>
                {g.items.map((i) => (
                  <InsightCard
                    key={i.insight_id}
                    insight={i}
                    onDismiss={handleDismiss}
                    onActedOn={handleActedOn}
                  />
                ))}
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: 24,
        borderRadius: "var(--kt-radius-2, 8px)",
        border: "1px dashed var(--kt-border-1)",
        background: "var(--kt-bg-subtle, var(--kt-bg-1))",
        textAlign: "center",
      }}
    >
      <p style={{ margin: 0, fontSize: 13, color: "var(--kt-fg-3)" }}>
        No insights yet. The Oracle surfaces patterns as data flows in from your
        connected sources.
      </p>
    </div>
  );
}

function FilteredEmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: "var(--kt-radius-2, 8px)",
        border: "1px dashed var(--kt-border-1)",
        background: "var(--kt-bg-subtle, var(--kt-bg-1))",
        textAlign: "center",
        fontSize: 13,
        color: "var(--kt-fg-3)",
      }}
    >
      No insights match these filters.{" "}
      <button
        type="button"
        onClick={onReset}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--kt-accent, var(--kt-fg-2))",
          cursor: "pointer",
          padding: 0,
          font: "inherit",
          textDecoration: "underline",
        }}
      >
        Clear filters
      </button>
      .
    </div>
  );
}
