"use client";

import type { HvActivity } from "@/types/contacts";

interface ActivityTimelineProps {
  activities: HvActivity[];
}

const TYPE_CONFIG: Record<string, { icon: string; label: string }> = {
  email_sent: { icon: "→", label: "Email sent" },
  email_opened: { icon: "👁", label: "Email opened" },
  email_clicked: { icon: "🔗", label: "Link clicked" },
  email_replied: { icon: "←", label: "Replied" },
  email_bounced: { icon: "×", label: "Bounced" },
  call_completed: { icon: "📞", label: "Call completed" },
  linkedin_connect_accepted: { icon: "in", label: "LinkedIn connected" },
  linkedin_message_received: { icon: "in", label: "LinkedIn message" },
  note_added: { icon: "✎", label: "Note added" },
  enriched: { icon: "⟳", label: "Enriched" },
  tag_changed: { icon: "#", label: "Tags updated" },
  suppressed: { icon: "⊘", label: "Suppressed" },
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <p style={{ color: "var(--text-tertiary)", fontSize: "0.8125rem", padding: "20px 0" }}>
        No activity yet.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {activities.map((activity, i) => {
        const config = TYPE_CONFIG[activity.type] ?? { icon: "•", label: activity.type };
        const detail = (activity.content as Record<string, string>)?.detail;

        return (
          <div
            key={activity.id}
            style={{
              display: "flex",
              gap: "12px",
              padding: "10px 0",
              borderBottom: i < activities.length - 1 ? "1px solid var(--border-subtle)" : "none",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "6px",
                backgroundColor: "var(--surface-raised)",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.75rem",
                flexShrink: 0,
              }}
            >
              {config.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-primary)" }}>
                  {config.label}
                </span>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    color: "var(--text-tertiary)",
                    fontFamily: "var(--font-mono, monospace), monospace",
                    flexShrink: 0,
                  }}
                >
                  {formatRelativeTime(activity.created_at)}
                </span>
              </div>
              {detail && (
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px", lineHeight: 1.4 }}>
                  {detail}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
