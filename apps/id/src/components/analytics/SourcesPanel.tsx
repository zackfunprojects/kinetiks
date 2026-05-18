"use client";

import { useEffect, useState } from "react";

interface SourceStatus {
  provider: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
}

export function SourcesPanel() {
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<SourceStatus[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/connections")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((body: { data?: { connections?: SourceStatus[] } }) => {
        if (cancelled) return;
        setSources(body.data?.connections ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSources([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        style={{ padding: 12, fontSize: 13, color: "var(--kt-fg-3)" }}
      >
        Loading source status…
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div
        style={{
          padding: 16,
          borderRadius: "var(--kt-radius-2, 8px)",
          border: "1px dashed var(--kt-border-1)",
          fontSize: 13,
          color: "var(--kt-fg-3)",
          textAlign: "center",
        }}
      >
        No data sources connected yet. Visit Connections to wire up GA4, Search
        Console, Stripe, HubSpot, Meta Ads, or Google Ads.
      </div>
    );
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 13, color: "var(--kt-fg-3)" }}>Sources</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {sources.map((s) => (
          <li
            key={s.provider}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              borderRadius: "var(--kt-radius-1, 6px)",
              border: "1px solid var(--kt-border-1)",
              background: "var(--kt-bg-1)",
            }}
          >
            <StatusDot status={s.status} />
            <span style={{ fontSize: 13, color: "var(--kt-fg-1)" }}>{s.provider}</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--kt-fg-3)" }}>
              {s.last_sync_at ? `synced ${relTime(s.last_sync_at)}` : "no sync yet"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "active"
      ? "var(--kt-success, var(--kt-fg-3))"
      : status === "error" || status === "expired"
        ? "var(--kt-danger, var(--kt-fg-3))"
        : "var(--kt-warning, var(--kt-fg-3))";
  return (
    <span
      aria-label={`Status: ${status}`}
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        background: color,
        display: "inline-block",
      }}
    />
  );
}

function relTime(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "";
    const secs = Math.round((Date.now() - t) / 1000);
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
    return `${Math.round(secs / 86400)}d ago`;
  } catch {
    return "";
  }
}
