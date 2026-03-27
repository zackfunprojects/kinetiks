"use client";

import type { SequenceMetric } from "@/types/analytics";

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  draft: { bg: "rgba(155,155,167,0.10)", fg: "var(--text-secondary)" },
  active: { bg: "rgba(61,124,71,0.10)", fg: "var(--harvest-green)" },
  paused: { bg: "rgba(192,139,45,0.10)", fg: "var(--harvest-amber)" },
  archived: { bg: "rgba(139,115,85,0.10)", fg: "var(--harvest-soil)" },
};

interface SequencePerformanceProps {
  sequences: SequenceMetric[];
}

export default function SequencePerformance({ sequences }: SequencePerformanceProps) {
  if (sequences.length === 0) {
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
        <p style={{ fontSize: 15, margin: "0 0 8px" }}>No sequences yet</p>
        <p style={{ fontSize: 13, margin: 0 }}>Sequence performance will appear here once you create sequences.</p>
      </div>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead>
        <tr>
          {["Name", "Status", "Enrolled", "Completed", "Replied", "Bounced", "Completion Rate", "Reply Rate"].map((h) => (
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
        {sequences.map((s) => {
          const statusColor = STATUS_COLORS[s.status] ?? STATUS_COLORS.draft;
          return (
            <tr
              key={s.id}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "var(--surface-raised)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
              }}
            >
              <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500, borderBottom: "1px solid var(--border-subtle)" }}>
                {s.name}
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
                  {s.status}
                </span>
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                {s.enrolled}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                {s.completed}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                {s.replied}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                {s.bounced}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500, borderBottom: "1px solid var(--border-subtle)" }}>
                {s.completion_rate}%
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500, borderBottom: "1px solid var(--border-subtle)" }}>
                {s.reply_rate}%
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
