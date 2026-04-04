"use client";

import type { ApprovalRecord } from "@/lib/approvals/types";

interface ReviewApprovalCardProps {
  approval: ApprovalRecord;
  onApprove: (id: string, edits?: Record<string, unknown>) => void;
  onReject: (id: string) => void;
}

export function ReviewApprovalCard({ approval, onApprove, onReject }: ReviewApprovalCardProps) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        border: "1px solid var(--border-muted)",
        background: "var(--bg-surface-raised)",
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
            background: "var(--warning-muted)",
            color: "var(--warning)",
            textTransform: "uppercase",
          }}
        >
          Review
        </span>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {approval.source_app}
        </span>
        {approval.confidence_score !== null && (
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: "auto" }}>
            {Math.round(approval.confidence_score)}% conf.
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>
        {approval.title}
      </div>

      {/* Description */}
      {approval.description && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 8,
            lineHeight: 1.4,
          }}
        >
          {approval.description}
        </div>
      )}

      {/* Content preview */}
      <div
        style={{
          padding: 10,
          borderRadius: 6,
          background: "var(--bg-inset)",
          border: "1px solid var(--border-muted)",
          fontSize: 12,
          color: "var(--text-secondary)",
          lineHeight: 1.5,
          maxHeight: 120,
          overflowY: "auto",
          marginBottom: 10,
          whiteSpace: "pre-wrap",
        }}
      >
        {formatPreview(approval.preview.content)}
      </div>

      {/* Deep link */}
      {approval.deep_link && (
        <a
          href={approval.deep_link}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11,
            color: "var(--accent-secondary)",
            textDecoration: "none",
            display: "block",
            marginBottom: 10,
          }}
        >
          View in {approval.source_app} &rarr;
        </a>
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
            background: "var(--success-muted)",
            color: "var(--success)",
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
            border: "1px solid var(--border-default)",
            background: "transparent",
            color: "var(--text-secondary)",
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

function formatPreview(content: Record<string, unknown>): string {
  if (typeof content.body === "string") return content.body;
  if (typeof content.content === "string") return content.content;
  if (typeof content.subject === "string" && typeof content.body === "string") {
    return `Subject: ${content.subject}\n\n${content.body}`;
  }
  return JSON.stringify(content, null, 2);
}
