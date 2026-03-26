"use client";

import { getScoreColor, getScoreBg } from "@/types/contacts";

interface ScoreBreakdownProps {
  leadScore: number;
  fitScore: number;
  intentScore: number;
  engagementScore: number;
}

const SCORE_LABELS: { key: keyof ScoreBreakdownProps; label: string; description: string }[] = [
  { key: "leadScore", label: "LEAD", description: "Composite score" },
  { key: "fitScore", label: "FIT", description: "ICP alignment" },
  { key: "intentScore", label: "INTENT", description: "Purchase signals" },
  { key: "engagementScore", label: "ENGAGE", description: "Activity level" },
];

export function ScoreBreakdown(props: ScoreBreakdownProps) {
  return (
    <div
      style={{
        backgroundColor: "var(--surface-raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "8px",
        padding: "16px",
      }}
    >
      <h4
        style={{
          fontSize: "0.6875rem",
          fontWeight: 600,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "12px",
        }}
      >
        Score breakdown
      </h4>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {SCORE_LABELS.map(({ key, label, description }) => {
          const score = props[key];
          const color = getScoreColor(score);
          const bg = getScoreBg(score);

          return (
            <div key={key}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "4px",
                }}
              >
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                  }}
                  title={description}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono, monospace), monospace",
                    color,
                  }}
                >
                  {score}
                </span>
              </div>
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: "var(--surface-elevated, rgba(255,255,255,0.04))",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, score)}%`,
                    borderRadius: 2,
                    backgroundColor: bg,
                    backgroundImage: `linear-gradient(90deg, ${color}, ${color})`,
                    backgroundSize: "100% 100%",
                    opacity: 0.7,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
