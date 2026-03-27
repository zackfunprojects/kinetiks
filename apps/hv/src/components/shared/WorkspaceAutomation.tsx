"use client";

import { useState } from "react";
import ModeIndicator from "./ModeIndicator";
import TrustMeter from "./TrustMeter";

/* ── Types ─────────────────────────────────────────────────── */

type AutomationMode = "human" | "assisted" | "autopilot";

interface OperatorStatus {
  name: string;
  operator: string;
  mode: AutomationMode;
  agreementRate: number;
  totalDecisions: number;
}

interface WorkspaceAutomationProps {
  operators: OperatorStatus[];
}

/* ── Component ─────────────────────────────────────────────── */

export default function WorkspaceAutomation({ operators }: WorkspaceAutomationProps) {
  const [expanded, setExpanded] = useState(false);

  const assistedCount = operators.filter((op) => op.mode === "assisted").length;
  const autopilotCount = operators.filter((op) => op.mode === "autopilot").length;
  const totalFeatures = operators.length;

  function getSummary(): string {
    const parts: string[] = [];
    if (autopilotCount > 0) parts.push(`${autopilotCount} autopilot`);
    if (assistedCount > 0) parts.push(`${assistedCount} assisted`);
    const automatedTotal = autopilotCount + assistedCount;
    if (automatedTotal === 0) return `All ${totalFeatures} features in human mode`;
    return `${automatedTotal} of ${totalFeatures} features graduated`;
  }

  return (
    <div
      style={{
        borderRadius: "var(--radius-md, 8px)",
        border: "1px solid var(--border-subtle, #eee)",
        backgroundColor: "var(--harvest-green-subtle, rgba(61,124,71,0.05))",
        overflow: "hidden",
        transition: `all var(--duration-normal, 250ms) ease`,
      }}
    >
      {/* Header (clickable) */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "10px 14px",
          border: "none",
          backgroundColor: "transparent",
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary, #111)" }}>
            Growth
          </span>
          <span style={{ fontSize: 12, color: "var(--text-tertiary, #888)" }}>
            {getSummary()}
          </span>
        </div>
        <span
          style={{
            fontSize: 10,
            color: "var(--text-tertiary, #888)",
            transition: `transform var(--duration-normal, 250ms) var(--ease-spring, cubic-bezier(0.34,1.56,0.64,1))`,
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          &#x25BC;
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div
          style={{
            padding: "0 14px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {operators.map((op) => (
            <div
              key={op.operator}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              {/* Operator name */}
              <div
                style={{
                  width: 80,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-primary, #111)",
                  flexShrink: 0,
                }}
              >
                {op.name}
              </div>

              {/* Mode badge */}
              <div style={{ flexShrink: 0 }}>
                <ModeIndicator mode={op.mode} size="sm" />
              </div>

              {/* Compact trust meter */}
              <div style={{ flex: 1, minWidth: 80 }}>
                <TrustMeter
                  agreementRate={op.agreementRate}
                  totalDecisions={op.totalDecisions}
                  currentMode={op.mode}
                  compact
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
