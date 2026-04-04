"use client";

import { useState, useEffect } from "react";
import { getMetricsByApp, METRIC_REGISTRY } from "@/lib/oracle/metric-schema";

interface AppPerformanceProps {
  days: number;
}

const APPS = [
  { key: "harvest", name: "Harvest", color: "var(--success)" },
  { key: "dark_madder", name: "Dark Madder", color: "var(--accent-secondary)" },
  { key: "litmus", name: "Litmus", color: "var(--warning)" },
  { key: "hypothesis", name: "Hypothesis", color: "var(--info)" },
];

export function AppPerformance({ days }: AppPerformanceProps) {
  const [metrics, setMetrics] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/oracle/metrics?days=${days}`)
      .then((res) => res.json())
      .then((data) => {
        const grouped: Record<string, Record<string, number>> = {};
        for (const m of data.data?.metrics ?? []) {
          if (!grouped[m.source_app]) grouped[m.source_app] = {};
          // Use latest value per metric
          grouped[m.source_app][m.metric_key] = m.metric_value;
        }
        setMetrics(grouped);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return <div style={{ padding: 16, color: "var(--text-tertiary)", fontSize: 13 }}>Loading...</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
      {APPS.map((app) => {
        const appMetrics = metrics[app.key] ?? {};
        const definitions = getMetricsByApp(app.key);
        const hasData = Object.keys(appMetrics).length > 0;

        return (
          <div
            key={app.key}
            style={{
              padding: 16,
              borderRadius: 8,
              border: "1px solid var(--border-muted)",
              background: "var(--bg-surface-raised)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: app.color }} />
              <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
                {app.name}
              </span>
            </div>

            {hasData ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {definitions.slice(0, 4).map((def) => (
                  <div key={def.key} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{def.name}</span>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono), monospace" }}>
                      {appMetrics[def.key]?.toLocaleString() ?? "-"}
                      {def.unit === "percentage" ? "%" : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                No data yet. Connect and report metrics.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
