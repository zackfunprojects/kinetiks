"use client";

import { useState, useEffect, useCallback } from "react";
import type { HvWebhookConfig } from "@/types/infra";

interface WebhookListProps {
  onAddClick: () => void;
}

export default function WebhookList({ onAddClick }: WebhookListProps) {
  const [webhooks, setWebhooks] = useState<HvWebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWebhooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hv/webhooks");
      if (!res.ok) throw new Error(`Failed to fetch webhooks: ${res.status}`);
      const json = await res.json();
      setWebhooks(json.data ?? []);
    } catch (err) {
      console.error("Error fetching webhooks:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);

  if (loading) {
    return <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading...</p>;
  }

  if (webhooks.length === 0) {
    return (
      <div style={{
        textAlign: "center", padding: 60, color: "var(--text-secondary)",
        border: "1px dashed var(--border-subtle)", borderRadius: 12,
      }}>
        <p style={{ fontSize: 15, margin: "0 0 8px" }}>No webhooks configured</p>
        <p style={{ fontSize: 13, margin: 0 }}>Add a webhook to receive real-time event notifications.</p>
      </div>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead>
        <tr>
          {["URL", "Events", "Active", "Last Delivered", "Failures"].map((h) => (
            <th key={h} style={{
              textAlign: "left", padding: "8px 12px", fontSize: 12, fontWeight: 600,
              color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em",
              borderBottom: "1px solid var(--border-subtle)",
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {webhooks.map((wh) => (
          <tr
            key={wh.id}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--surface-raised)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
          >
            <td style={{
              padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500,
              borderBottom: "1px solid var(--border-subtle)", maxWidth: 280, overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {wh.url}
            </td>
            <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)", maxWidth: 200 }}>
              <span style={{ fontSize: 13 }}>{(wh.events ?? []).join(", ")}</span>
            </td>
            <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
              <span style={{
                display: "inline-block", padding: "2px 8px", borderRadius: 4,
                fontSize: 12, fontWeight: 600,
                backgroundColor: wh.is_active ? "rgba(0,206,201,0.12)" : "rgba(155,155,167,0.12)",
                color: wh.is_active ? "#00CEC9" : "var(--text-secondary)",
              }}>
                {wh.is_active ? "active" : "inactive"}
              </span>
            </td>
            <td style={{ padding: "10px 12px", color: "var(--text-tertiary)", fontSize: 13, borderBottom: "1px solid var(--border-subtle)" }}>
              {wh.last_delivered_at ? new Date(wh.last_delivered_at).toLocaleDateString() : "-"}
            </td>
            <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
              <span style={{
                color: wh.consecutive_failures > 0 ? "#FF7675" : "var(--text-secondary)",
                fontWeight: wh.consecutive_failures > 0 ? 600 : 400, fontSize: 13,
              }}>
                {wh.consecutive_failures}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
