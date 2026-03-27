"use client";

import { useState, useEffect, useCallback } from "react";
import type { HvMailbox, WarmupStatus } from "@/types/infra";

interface MailboxListProps {
  onAddClick: () => void;
}

const WARMUP_COLORS: Record<WarmupStatus, { bg: string; fg: string }> = {
  not_started: { bg: "rgba(155,155,167,0.10)", fg: "var(--text-secondary)" },
  warming: { bg: "rgba(192,139,45,0.10)", fg: "var(--harvest-amber)" },
  warm: { bg: "rgba(61,124,71,0.10)", fg: "var(--harvest-green)" },
  paused: { bg: "rgba(212,64,64,0.10)", fg: "var(--error, #d44040)" },
};

export default function MailboxList({ onAddClick }: MailboxListProps) {
  const [mailboxes, setMailboxes] = useState<HvMailbox[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMailboxes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hv/mailboxes");
      if (!res.ok) throw new Error(`Failed to fetch mailboxes: ${res.status}`);
      const json = await res.json();
      setMailboxes(json.data ?? []);
    } catch (err) {
      console.error("Error fetching mailboxes:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMailboxes(); }, [fetchMailboxes]);

  async function toggleActive(mailbox: HvMailbox) {
    try {
      const res = await fetch(`/api/hv/mailboxes/${mailbox.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !mailbox.is_active }),
      });
      if (!res.ok) throw new Error(`Failed to toggle mailbox: ${res.status}`);
    } catch (err) {
      console.error("Error toggling mailbox:", err);
    }
    fetchMailboxes();
  }

  if (loading) {
    return <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading...</p>;
  }

  if (mailboxes.length === 0) {
    return (
      <div style={{
        textAlign: "center", padding: 60, color: "var(--text-secondary)",
        border: "1px dashed var(--border-subtle)", borderRadius: 12,
      }}>
        <p style={{ fontSize: 15, margin: "0 0 8px" }}>No mailboxes yet</p>
        <p style={{ fontSize: 13, margin: 0 }}>Add a mailbox to start sending outreach.</p>
      </div>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead>
        <tr>
          {["Email", "Display Name", "Provider", "Warmup", "Reputation", "Daily Limit", "Active"].map((h) => (
            <th key={h} style={{
              textAlign: "left", padding: "8px 12px", fontSize: 12, fontWeight: 600,
              color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em",
              borderBottom: "1px solid var(--border-subtle)",
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {mailboxes.map((mb) => {
          const warmupColor = WARMUP_COLORS[mb.warmup_status] ?? WARMUP_COLORS.not_started;
          return (
            <tr
              key={mb.id}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--surface-raised)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
            >
              <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500, borderBottom: "1px solid var(--border-subtle)" }}>
                {mb.email}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                {mb.display_name}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                {mb.provider}
              </td>
              <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                <span style={{
                  display: "inline-block", padding: "2px 8px", borderRadius: 4,
                  fontSize: 12, fontWeight: 600, backgroundColor: warmupColor.bg, color: warmupColor.fg,
                }}>
                  {mb.warmup_status.replace("_", " ")}
                </span>
              </td>
              <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 60, height: 6, borderRadius: 3, backgroundColor: "var(--border-subtle)", overflow: "hidden",
                  }}>
                    <div style={{
                      width: `${mb.reputation_score}%`, height: "100%", borderRadius: 3,
                      backgroundColor: mb.reputation_score >= 80 ? "var(--harvest-green)" : mb.reputation_score >= 50 ? "var(--harvest-amber)" : "var(--error, #d44040)",
                    }} />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{mb.reputation_score}</span>
                </div>
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                {mb.daily_sent_today}/{mb.daily_limit}
              </td>
              <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                <button
                  onClick={() => toggleActive(mb)}
                  style={{
                    width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer",
                    backgroundColor: mb.is_active ? "var(--harvest-green)" : "var(--border-subtle)",
                    position: "relative", transition: "background-color 0.2s",
                  }}
                >
                  <span style={{
                    position: "absolute", top: 2, width: 16, height: 16, borderRadius: 8,
                    backgroundColor: "#fff", transition: "left 0.2s",
                    left: mb.is_active ? 18 : 2,
                  }} />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
