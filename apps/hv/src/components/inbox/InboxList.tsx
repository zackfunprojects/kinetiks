"use client";

import { useState, useEffect, useCallback } from "react";
import type { InboxEmail, ReplyClassification } from "@/types/inbox";

interface InboxListProps {
  onSelect: (email: InboxEmail) => void;
}

const CLASSIFICATION_COLORS: Record<ReplyClassification, { bg: string; fg: string }> = {
  interested: { bg: "rgba(0,206,201,0.12)", fg: "#00CEC9" },
  not_interested: { bg: "rgba(255,118,117,0.12)", fg: "#FF7675" },
  bounce: { bg: "rgba(155,155,167,0.12)", fg: "var(--text-secondary)" },
  ooo: { bg: "rgba(253,203,110,0.12)", fg: "#FDCB6E" },
  referral: { bg: "rgba(108,92,231,0.12)", fg: "#6C5CE7" },
  unclassified: { bg: "rgba(155,155,167,0.08)", fg: "var(--text-tertiary)" },
};

const CLASSIFICATION_LABELS: Record<ReplyClassification, string> = {
  interested: "Interested",
  not_interested: "Not Interested",
  bounce: "Bounce",
  ooo: "OOO",
  referral: "Referral",
  unclassified: "Unclassified",
};

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

export default function InboxList({ onSelect }: InboxListProps) {
  const [emails, setEmails] = useState<InboxEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReplyClassification | "">("");

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set("classification", filter);
    const res = await fetch(`/api/hv/inbox?${params}`);
    const json = await res.json();
    setEmails(json.data ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchEmails(); }, [fetchEmails]);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Inbox</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "4px 0 0" }}>
          Replies to your outreach emails
        </p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(["", "interested", "not_interested", "ooo", "referral", "bounce", "unclassified"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border-subtle)",
              backgroundColor: filter === s ? "var(--surface-raised)" : "transparent",
              color: filter === s ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            {s ? CLASSIFICATION_LABELS[s] : "All"}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading...</p>
      ) : emails.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 60, color: "var(--text-secondary)",
          border: "1px dashed var(--border-subtle)", borderRadius: 12,
        }}>
          <p style={{ fontSize: 15, margin: "0 0 8px" }}>No replies yet</p>
          <p style={{ fontSize: 13, margin: 0 }}>Replies to your outreach emails will appear here.</p>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              {["Subject", "Contact", "Reply Preview", "Classification", "Replied"].map((h) => (
                <th key={h} style={{
                  textAlign: "left", padding: "8px 12px", fontSize: 12, fontWeight: 600,
                  color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em",
                  borderBottom: "1px solid var(--border-subtle)",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {emails.map((email) => {
              const classification = email.reply_classification ?? "unclassified";
              const classColor = CLASSIFICATION_COLORS[classification] ?? CLASSIFICATION_COLORS.unclassified;
              return (
                <tr
                  key={email.id}
                  onClick={() => onSelect(email)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--surface-raised)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                >
                  <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500, borderBottom: "1px solid var(--border-subtle)", maxWidth: 200 }}>
                    {truncate(email.subject, 50)}
                  </td>
                  <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                    {email.contact_name ?? "-"}
                  </td>
                  <td style={{ padding: "10px 12px", color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)", maxWidth: 260 }}>
                    {email.reply_body ? truncate(email.reply_body, 60) : "-"}
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 4,
                      fontSize: 12, fontWeight: 600, backgroundColor: classColor.bg, color: classColor.fg,
                    }}>
                      {CLASSIFICATION_LABELS[classification]}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "var(--text-tertiary)", fontSize: 13, borderBottom: "1px solid var(--border-subtle)" }}>
                    {email.replied_at ? new Date(email.replied_at).toLocaleDateString() : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
