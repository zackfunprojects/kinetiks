"use client";

import { useEffect, useState } from "react";

/* ── Types ─────────────────────────────────────────────────── */

type AutomationMode = "human" | "assisted" | "autopilot";

interface TrustMeterProps {
  agreementRate: number;
  totalDecisions: number;
  currentMode: AutomationMode;
  assistedThreshold?: number;
  autopilotThreshold?: number;
  autopilotAgreement?: number;
  compact?: boolean;
}

/* ── Constants ─────────────────────────────────────────────── */

const MODE_COLORS: Record<AutomationMode, string> = {
  human: "var(--mode-human, #6B6860)",
  assisted: "var(--mode-assisted, #C08B2D)",
  autopilot: "var(--mode-autopilot, #3D7C47)",
};

const MODE_MUTED: Record<AutomationMode, string> = {
  human: "var(--mode-human-muted, rgba(107,104,96,0.10))",
  assisted: "var(--mode-assisted-muted, rgba(192,139,45,0.10))",
  autopilot: "var(--mode-autopilot-muted, rgba(61,124,71,0.10))",
};

/* ── Component ─────────────────────────────────────────────── */

export default function TrustMeter({
  agreementRate,
  totalDecisions,
  currentMode,
  assistedThreshold = 20,
  autopilotThreshold = 50,
  autopilotAgreement = 0.9,
  compact = false,
}: TrustMeterProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /* Position marker as % of bar */
  const maxDecisions = autopilotThreshold * 1.2;
  const markerPosition = Math.min(totalDecisions / maxDecisions, 1) * 100;

  /* Segment widths as % */
  const humanWidth = (assistedThreshold / maxDecisions) * 100;
  const assistedWidth = ((autopilotThreshold - assistedThreshold) / maxDecisions) * 100;
  const autopilotWidth = 100 - humanWidth - assistedWidth;

  const barHeight = compact ? 4 : 6;

  /* Status label */
  function getLabel(): string {
    if (currentMode === "human") {
      const remaining = assistedThreshold - totalDecisions;
      if (remaining > 0) return `Human mode - ${remaining} more decisions needed`;
      return `Human mode - ${totalDecisions} decisions`;
    }
    if (currentMode === "assisted") {
      const pct = Math.round(agreementRate * 100);
      const targetPct = Math.round(autopilotAgreement * 100);
      if (totalDecisions < autopilotThreshold) {
        const remaining = autopilotThreshold - totalDecisions;
        return `Assisted - ${pct}% agreement (${remaining} more decisions for autopilot)`;
      }
      return `Assisted - ${pct}% agreement (need ${targetPct}% for autopilot)`;
    }
    return `Autopilot - ${Math.round(agreementRate * 100)}% agreement`;
  }

  return (
    <div style={{ width: "100%" }}>
      {/* Bar container */}
      <div
        role="progressbar"
        aria-valuenow={Math.round(agreementRate * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Trust meter: ${Math.round(agreementRate * 100)}% agreement, ${totalDecisions} decisions`}
        style={{
          position: "relative",
          height: barHeight,
          borderRadius: barHeight / 2,
          display: "flex",
          overflow: "hidden",
          backgroundColor: "var(--border-default, #e5e5e5)",
        }}
      >
        {/* Human segment */}
        <div
          style={{
            width: `${humanWidth}%`,
            height: "100%",
            backgroundColor: currentMode === "human"
              ? MODE_COLORS.human
              : MODE_MUTED.human,
            transition: `background-color var(--duration-normal, 250ms) var(--ease-spring, cubic-bezier(0.34,1.56,0.64,1))`,
          }}
        />
        {/* Assisted segment */}
        <div
          style={{
            width: `${assistedWidth}%`,
            height: "100%",
            backgroundColor: currentMode === "assisted" || currentMode === "autopilot"
              ? MODE_COLORS.assisted
              : MODE_MUTED.assisted,
            transition: `background-color var(--duration-normal, 250ms) var(--ease-spring, cubic-bezier(0.34,1.56,0.64,1))`,
          }}
        />
        {/* Autopilot segment */}
        <div
          style={{
            width: `${autopilotWidth}%`,
            height: "100%",
            backgroundColor: currentMode === "autopilot"
              ? MODE_COLORS.autopilot
              : MODE_MUTED.autopilot,
            transition: `background-color var(--duration-normal, 250ms) var(--ease-spring, cubic-bezier(0.34,1.56,0.64,1))`,
          }}
        />

        {/* Position marker */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: mounted ? `${markerPosition}%` : "0%",
            transform: "translate(-50%, -50%)",
            width: compact ? 8 : 10,
            height: compact ? 8 : 10,
            borderRadius: "50%",
            backgroundColor: MODE_COLORS[currentMode],
            border: "2px solid var(--surface-base, #fff)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.10)",
            transition: `left var(--duration-slow, 400ms) var(--ease-spring, cubic-bezier(0.34,1.56,0.64,1))`,
            zIndex: 1,
          }}
        />
      </div>

      {/* Label (full version only) */}
      {!compact && (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: "var(--text-tertiary, #888)",
            fontFamily: "var(--font-sans)",
          }}
        >
          <span style={{ color: MODE_COLORS[currentMode], fontWeight: 500 }}>
            {getLabel()}
          </span>
        </div>
      )}
    </div>
  );
}
