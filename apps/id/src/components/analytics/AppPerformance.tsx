"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, Sparkline, AsyncSection } from "@kinetiks/ui";
import { getMetricDefinition } from "@/lib/oracle/metric-schema";

interface AppPerformanceProps {
  days: number;
}

interface MetricRow {
  source_app: string;
  metric_key: string;
  metric_value: number;
  period_start: string;
}

const APP_META: Record<string, { label: string; color: string }> = {
  harvest: { label: "Harvest", color: "var(--kt-app-harvest)" },
  dark_madder: { label: "Dark Madder", color: "var(--kt-app-darkmadder)" },
  litmus: { label: "Litmus", color: "var(--kt-app-litmus)" },
  hypothesis: { label: "Hypothesis", color: "var(--kt-app-hypothesis)" },
  ga4: { label: "Google Analytics", color: "var(--kt-accent)" },
  gsc: { label: "Search Console", color: "var(--kt-accent)" },
  stripe: { label: "Stripe", color: "var(--kt-app-ads)" },
  google_ads: { label: "Google Ads", color: "var(--kt-app-ads)" },
  meta_ads: { label: "Meta Ads", color: "var(--kt-app-ads)" },
  hubspot: { label: "HubSpot", color: "var(--kt-warm)" },
};

function appMeta(app: string): { label: string; color: string } {
  return APP_META[app] ?? { label: app, color: "var(--kt-accent)" };
}

function formatValue(value: number, unit: string | undefined): string {
  const num = (Math.round(value * 10) / 10).toLocaleString();
  return unit === "percentage" ? `${num}%` : num;
}

export function AppPerformance({ days }: AppPerformanceProps) {
  const [rows, setRows] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/oracle/metrics?days=${days}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setRows((data.data?.metrics ?? []) as MetricRow[]))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load metrics"))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  // Group rows (already period-ordered) into app -> metric_key -> value series.
  const byApp = useMemo(() => {
    const out: Record<string, Record<string, number[]>> = {};
    for (const r of rows) {
      (out[r.source_app] ??= {});
      (out[r.source_app][r.metric_key] ??= []).push(r.metric_value);
    }
    return out;
  }, [rows]);

  const apps = useMemo(() => Object.keys(byApp).sort(), [byApp]);

  return (
    <AsyncSection
      loading={loading}
      error={error}
      isEmpty={apps.length === 0}
      onRetry={load}
      errorTitle="We couldn't load performance metrics."
      emptyFallback={
        <Card variant="muted">
          <div className="kt-body">
            No performance data for this range yet. Metrics appear here as your connected apps report them.
          </div>
        </Card>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--kt-s-3)" }}>
        {apps.map((app) => {
          const meta = appMeta(app);
          const metricKeys = Object.keys(byApp[app]);
          return (
            <Card key={app}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--kt-s-2)", marginBottom: "var(--kt-s-3)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "var(--kt-radius-full)", background: meta.color }} aria-hidden />
                <span className="kt-card-title">{meta.label}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--kt-s-3)" }}>
                {metricKeys.slice(0, 5).map((key) => {
                  const series = byApp[app][key];
                  const def = getMetricDefinition(key);
                  const latest = series.at(-1) ?? 0;
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--kt-s-3)" }}>
                      <span className="kt-small" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {def?.name ?? key}
                      </span>
                      {series.length >= 2 ? (
                        <Sparkline values={series} width={72} height={20} color={meta.color} ariaLabel={`${def?.name ?? key} trend`} />
                      ) : null}
                      <span className="kt-data-inline" style={{ minWidth: 56, textAlign: "right", color: "var(--kt-fg-1)" }}>
                        {formatValue(latest, def?.unit)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </AsyncSection>
  );
}
