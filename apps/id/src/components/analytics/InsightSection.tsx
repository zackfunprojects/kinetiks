"use client";

import { useState, useEffect } from "react";

interface Insight {
  id: string;
  insight_type: string;
  severity: string;
  title: string;
  body: string;
  recommendation: string | null;
  source_apps: string[];
  confidence: number;
  created_at: string;
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  critical: { bg: "var(--kt-danger-soft)", text: "var(--kt-danger)" },
  warning: { bg: "var(--kt-warning-soft)", text: "var(--kt-warning)" },
  opportunity: { bg: "var(--kt-success-soft)", text: "var(--kt-success)" },
  info: { bg: "var(--kt-accent-soft)", text: "var(--kt-accent)" },
};

export function InsightSection() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/oracle/insights?limit=5")
      .then((res) => res.json())
      .then((data) => setInsights(data.data?.insights ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ padding: 16, color: "var(--kt-fg-3)", fontSize: 13 }}>Loading insights...</div>;
  }

  if (insights.length === 0) {
    return (
      <div style={{ padding: 24, borderRadius: 8, border: "1px dashed var(--kt-border-1)", background: "var(--kt-bg-subtle)", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "var(--kt-fg-3)", margin: 0 }}>
          No insights yet. The Oracle will surface patterns as data flows in.
        </p>
      </div>
    );
  }

  const handleDismiss = async (id: string) => {
    await fetch("/api/oracle/insights", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, dismissed: true }),
    });
    setInsights((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {insights.map((insight) => {
        const colors = SEVERITY_COLORS[insight.severity] ?? SEVERITY_COLORS.info;
        return (
          <div
            key={insight.id}
            style={{
              padding: 16,
              borderRadius: 8,
              border: "1px solid var(--kt-border-2)",
              background: "var(--kt-bg-muted)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: colors.bg,
                  color: colors.text,
                  textTransform: "uppercase",
                }}
              >
                {insight.severity}
              </span>
              <span style={{ fontSize: 11, color: "var(--kt-fg-3)" }}>
                {insight.insight_type}
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--kt-fg-1)", marginBottom: 4 }}>
              {insight.title}
            </div>
            <div style={{ fontSize: 13, color: "var(--kt-fg-2)", lineHeight: 1.5, marginBottom: 8 }}>
              {insight.body}
            </div>
            {insight.recommendation && (
              <div style={{ fontSize: 12, color: "var(--kt-warm)", marginBottom: 8 }}>
                Recommendation: {insight.recommendation}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <a
                href={`/chat?q=${encodeURIComponent(`Tell me more about: ${insight.title}`)}`}
                style={{
                  fontSize: 12,
                  color: "var(--kt-warm)",
                  textDecoration: "none",
                }}
              >
                Ask about this
              </a>
              <button
                onClick={() => handleDismiss(insight.id)}
                style={{
                  fontSize: 12,
                  color: "var(--kt-fg-3)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
