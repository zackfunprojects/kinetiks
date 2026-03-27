"use client";

import { useEffect, useState } from "react";

/* ── Types ─────────────────────────────────────────────────── */

type AutomationMode = "human" | "assisted" | "autopilot";

interface GrowthMeterProps {
  level: number;
  mode: AutomationMode;
}

/* ── Constants ─────────────────────────────────────────────── */

const MODE_COLORS: Record<AutomationMode, string> = {
  human: "#6B6860",
  assisted: "#C08B2D",
  autopilot: "#3D7C47",
};

const MODE_LABELS: Record<AutomationMode, string> = {
  human: "Human",
  assisted: "Assisted",
  autopilot: "Autopilot",
};

/* ── Component ─────────────────────────────────────────────── */

export default function GrowthMeter({ level, mode }: GrowthMeterProps) {
  const [animatedLevel, setAnimatedLevel] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedLevel(level), 50);
    return () => clearTimeout(timer);
  }, [level]);

  const width = 80;
  const height = 48;
  const strokeWidth = 6;
  const radius = (width - strokeWidth) / 2;
  const cx = width / 2;
  const cy = height - 2;

  /* Semi-circle arc from 180deg to 0deg (left to right) */
  const circumference = Math.PI * radius;
  const fillLength = (animatedLevel / 100) * circumference;
  const dashOffset = circumference - fillLength;

  const color = MODE_COLORS[mode];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
      }}
    >
      <div style={{ position: "relative", width, height }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ overflow: "visible" }}
        >
          {/* Background arc */}
          <path
            d={describeArc(cx, cy, radius, 180, 0)}
            fill="none"
            stroke="var(--border-default, #e5e5e5)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Filled arc */}
          <path
            d={describeArc(cx, cy, radius, 180, 0)}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{
              transition: `stroke-dashoffset var(--duration-slow, 400ms) var(--ease-spring, cubic-bezier(0.34,1.56,0.64,1)), stroke var(--duration-normal, 250ms) ease`,
            }}
          />
        </svg>

        {/* Center number */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 16,
            fontWeight: 700,
            fontFamily: "var(--font-mono, monospace)",
            color: "var(--text-primary, #111)",
            lineHeight: 1,
          }}
        >
          {level}%
        </div>
      </div>

      {/* Mode label */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          color,
          fontFamily: "var(--font-sans)",
          lineHeight: 1,
        }}
      >
        {MODE_LABELS[mode]}
      </div>
    </div>
  );
}

/* ── SVG arc helper ────────────────────────────────────────── */

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  const sweepFlag = endAngle > startAngle ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
}
