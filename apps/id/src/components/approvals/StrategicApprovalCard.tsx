"use client";

import type { ApprovalRecord } from "@/lib/approvals/types";

interface StrategicApprovalCardProps {
  approval: ApprovalRecord;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  systemName: string | null;
}

export function StrategicApprovalCard({
  approval,
  onApprove,
  onReject,
  systemName,
}: StrategicApprovalCardProps) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        border: "1px solid var(--kt-danger-soft)",
        background: "var(--kt-bg-muted)",
        marginBottom: 8,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 4,
            background: "var(--kt-danger-soft)",
            color: "var(--kt-danger)",
            textTransform: "uppercase",
          }}
        >
          Strategic
        </span>
        <span style={{ fontSize: 11, color: "var(--kt-fg-3)" }}>
          {approval.source_app}
        </span>
        {approval.confidence_score !== null && (
          <span style={{ fontSize: 11, color: "var(--kt-fg-3)", marginLeft: "auto" }}>
            {Math.round(approval.confidence_score)}% conf.
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--kt-fg-1)", marginBottom: 8 }}>
        {approval.title}
      </div>

      {/* Description with reasoning */}
      {approval.description && (
        <div
          style={{
            fontSize: 12,
            color: "var(--kt-fg-2)",
            marginBottom: 10,
            lineHeight: 1.5,
            padding: 10,
            borderRadius: 6,
            background: "var(--kt-bg-base)",
            border: "1px solid var(--kt-border-2)",
          }}
        >
          {approval.description}
        </div>
      )}

      {/* Confidence breakdown */}
      {approval.confidence_breakdown && (
        <div
          style={{
            fontSize: 11,
            color: "var(--kt-fg-3)",
            marginBottom: 10,
            fontFamily: "var(--font-mono), monospace",
          }}
        >
          <div>Cortex: {approval.confidence_breakdown.cortex} | Category: {approval.confidence_breakdown.category} | Specificity: {approval.confidence_breakdown.specificity} | Agent: {approval.confidence_breakdown.agent}</div>
        </div>
      )}

      {/* Discuss link */}
      <a
        href="/chat"
        style={{
          fontSize: 12,
          color: "var(--kt-warm)",
          textDecoration: "none",
          display: "block",
          marginBottom: 10,
        }}
      >
        Discuss with {systemName || "your system"} &rarr;
      </a>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => onApprove(approval.id)}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 6,
            border: "none",
            background: "var(--kt-success-soft)",
            color: "var(--kt-success)",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Approve
        </button>
        <button
          onClick={() => onReject(approval.id)}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid var(--kt-danger-soft)",
            background: "transparent",
            color: "var(--kt-danger)",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
