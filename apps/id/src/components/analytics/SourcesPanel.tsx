"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, StatusPill, AsyncSection, type PillTone } from "@kinetiks/ui";

interface SourceStatus {
  provider: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
}

function statusTone(status: string): PillTone {
  if (status === "active") return "success";
  if (status === "error" || status === "expired") return "danger";
  return "warning";
}

export function SourcesPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceStatus[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/connections")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((body: { data?: { connections?: SourceStatus[] } }) => {
        setSources(body.data?.connections ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load sources"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--kt-s-2)" }}>
      <h3 className="kt-eyebrow" style={{ margin: 0 }}>Sources</h3>
      <AsyncSection
        loading={loading}
        error={error}
        isEmpty={sources.length === 0}
        onRetry={load}
        errorTitle="We couldn't load source status."
        emptyFallback={
          <Card variant="muted">
            <div className="kt-body">
              No data sources connected yet. Connect GA4, Search Console, Stripe, HubSpot, or Ads in Integrations.
            </div>
          </Card>
        }
      >
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--kt-s-1)" }}>
          {sources.map((s) => {
            const needsReconnect = s.status === "error" || s.status === "expired";
            return (
              <li
                key={s.provider}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--kt-s-3)",
                  padding: "var(--kt-s-2) var(--kt-s-3)",
                  borderRadius: "var(--kt-radius-1)",
                  border: "1px solid var(--kt-border-1)",
                  background: "var(--kt-bg-elevated)",
                }}
              >
                <StatusPill tone={statusTone(s.status)}>{s.status}</StatusPill>
                <span className="kt-card-title">{s.provider}</span>
                <span className="kt-small" style={{ marginLeft: "auto" }}>
                  {needsReconnect ? (
                    <Link className="kt-link" href="/cortex/integrations">Reconnect</Link>
                  ) : s.last_sync_at ? (
                    `synced ${relTime(s.last_sync_at)}`
                  ) : (
                    "no sync yet"
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </AsyncSection>
    </section>
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
