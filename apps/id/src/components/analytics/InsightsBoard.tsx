"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, Button } from "@kinetiks/ui";

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

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
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

  useEffect(() => load(), [load]);

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

  const handleDismiss = (id: string) =>
    setInsights((prev) => prev.filter((i) => i.insight_id !== id));
  const handleActedOn = (id: string) =>
    setInsights((prev) => prev.map((i) => (i.insight_id === id ? { ...i, acted_on: true } : i)));

  const resetFilters = () => {
    setSeverityFilter("all");
    setSourceFilter("all");
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--kt-s-4)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 className="kt-section-title" style={{ margin: 0 }}>Insights</h2>
        <span className="kt-small">{loading ? "" : `${filtered.length} of ${insights.length}`}</span>
      </header>

      {!loading && !error && insights.length > 0 ? (
        <InsightFilters
          severity={severityFilter}
          onSeverityChange={setSeverityFilter}
          sourceApp={sourceFilter}
          availableSources={availableSources}
          onSourceChange={setSourceFilter}
        />
      ) : null}

      {loading ? (
        <InsightSkeleton />
      ) : error ? (
        <ErrorState title="We couldn't load insights." onRetry={load} />
      ) : insights.length === 0 ? (
        <EmptyState
          title="No insights yet."
          body="The Oracle surfaces patterns as data flows in from your connected sources."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No insights match these filters."
          action={<Button variant="ghost" size="sm" onClick={resetFilters}>Clear filters</Button>}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--kt-s-5)" }}>
          {grouped.map((g) =>
            g.items.length === 0 ? null : (
              <div key={g.severity} style={{ display: "flex", flexDirection: "column", gap: "var(--kt-s-3)" }}>
                <h3 className="kt-eyebrow" style={{ margin: 0 }}>
                  {g.severity} ({g.items.length})
                </h3>
                {g.items.map((i) => (
                  <InsightCard key={i.insight_id} insight={i} onDismiss={handleDismiss} onActedOn={handleActedOn} />
                ))}
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}
