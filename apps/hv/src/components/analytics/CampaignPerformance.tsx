"use client";

import type { CampaignMetric } from "@/types/analytics";

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  draft: { bg: "rgba(155,155,167,0.10)", fg: "var(--text-secondary)" },
  active: { bg: "rgba(61,124,71,0.10)", fg: "var(--harvest-green)" },
  paused: { bg: "rgba(192,139,45,0.10)", fg: "var(--harvest-amber)" },
  completed: { bg: "rgba(139,115,85,0.10)", fg: "var(--harvest-soil)" },
};

interface CampaignPerformanceProps {
  campaigns: CampaignMetric[];
}

export default function CampaignPerformance({ campaigns }: CampaignPerformanceProps) {
  if (campaigns.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: 60,
          color: "var(--text-secondary)",
          border: "1px dashed var(--border-subtle)",
          borderRadius: 12,
        }}
      >
        <p style={{ fontSize: 15, margin: "0 0 8px" }}>No campaigns yet</p>
        <p style={{ fontSize: 13, margin: 0 }}>Campaign performance will appear here once you create campaigns.</p>
      </div>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead>
        <tr>
          {["Name", "Status", "Sent", "Opened", "Replied", "Bounced", "Open Rate", "Reply Rate"].map((h) => (
            <th
              key={h}
              style={{
                textAlign: "left",
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {campaigns.map((c) => {
          const statusColor = STATUS_COLORS[c.status] ?? STATUS_COLORS.draft;
          return (
            <tr
              key={c.id}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "var(--surface-raised)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
              }}
            >
              <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500, borderBottom: "1px solid var(--border-subtle)" }}>
                {c.name}
              </td>
              <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    backgroundColor: statusColor.bg,
                    color: statusColor.fg,
                  }}
                >
                  {c.status}
                </span>
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                {c.sent}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                {c.opened}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                {c.replied}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                {c.bounced}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500, borderBottom: "1px solid var(--border-subtle)" }}>
                {c.open_rate}%
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500, borderBottom: "1px solid var(--border-subtle)" }}>
                {c.reply_rate}%
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
