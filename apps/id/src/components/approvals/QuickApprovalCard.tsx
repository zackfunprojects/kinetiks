"use client";

import type { ApprovalRecord } from "@/lib/approvals/types";

interface QuickApprovalCardProps {
  approval: ApprovalRecord;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function QuickApprovalCard({ approval, onApprove, onReject }: QuickApprovalCardProps) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        border: "1px solid var(--kt-border-2)",
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
            background: "var(--kt-accent-soft)",
            color: "var(--kt-accent)",
            textTransform: "uppercase",
          }}
        >
          Quick
        </span>
        <span style={{ fontSize: 11, color: "var(--kt-fg-3)" }}>
          {approval.source_app}
        </span>
      </div>

      {/* Title */}
      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--kt-fg-1)", marginBottom: 6 }}>
        {approval.title}
      </div>

      {/* Content preview */}
      {approval.description && (
        <div
          style={{
            fontSize: 12,
            color: "var(--kt-fg-2)",
            marginBottom: 10,
            lineHeight: 1.4,
            maxHeight: 60,
            overflow: "hidden",
          }}
        >
          {approval.description}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => onApprove(approval.id)}
          style={{
            flex: 1,
            padding: "6px 12px",
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
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--kt-border-1)",
            background: "transparent",
            color: "var(--kt-fg-2)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
