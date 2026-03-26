"use client";

import { getScoreColor, getScoreBg } from "@/types/contacts";

interface ScoreBadgeProps {
  score: number;
  label?: string;
  size?: "sm" | "md";
}

export function ScoreBadge({ score, label, size = "sm" }: ScoreBadgeProps) {
  const color = getScoreColor(score);
  const bg = getScoreBg(score);
  const fontSize = size === "sm" ? "0.75rem" : "0.875rem";
  const padding = size === "sm" ? "2px 8px" : "4px 10px";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding,
        borderRadius: "4px",
        backgroundColor: bg,
        color,
        fontSize,
        fontFamily: "var(--font-mono, monospace), monospace",
        fontWeight: 600,
        lineHeight: 1.2,
      }}
    >
      {label && (
        <span style={{ fontSize: "0.625rem", fontWeight: 500, textTransform: "uppercase", opacity: 0.7 }}>
          {label}
        </span>
      )}
      {score}
    </span>
  );
}
