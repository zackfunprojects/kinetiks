"use client";

import { Card, Button, StatusPill, ConfidenceRing } from "@kinetiks/ui";
import type { ApprovalRecord } from "@/lib/approvals/types";
import { categoryThreshold, confidenceFraction } from "./confidence";

interface ReviewApprovalCardProps {
  approval: ApprovalRecord;
  onApprove: (id: string, edits?: Record<string, unknown>) => void;
  onReject: (id: string) => void;
}

export function ReviewApprovalCard({ approval, onApprove, onReject }: ReviewApprovalCardProps) {
  const threshold = categoryThreshold(approval.action_category);
  return (
    <Card style={{ marginBottom: "var(--kt-s-2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--kt-s-2)", marginBottom: "var(--kt-s-2)" }}>
        <StatusPill tone="warning">Review</StatusPill>
        <span className="kt-small">{approval.source_app}</span>
        {approval.confidence_score !== null ? (
          <span style={{ marginLeft: "auto" }}>
            <ConfidenceRing
              value={confidenceFraction(approval.confidence_score)}
              threshold={threshold}
              showThresholdTick
              showLabel
              size="md"
              ariaLabel={`Confidence ${Math.round(approval.confidence_score)} percent versus ${Math.round(threshold * 100)} percent auto-approve threshold`}
            />
          </span>
        ) : null}
      </div>

      <div className="kt-card-title" style={{ marginBottom: "var(--kt-s-1)" }}>{approval.title}</div>
      {approval.description ? <div className="kt-small" style={{ marginBottom: "var(--kt-s-2)" }}>{approval.description}</div> : null}

      <div
        style={{
          padding: "var(--kt-s-3)",
          borderRadius: "var(--kt-radius-1)",
          background: "var(--kt-bg-subtle)",
          border: "1px solid var(--kt-border-1)",
          fontSize: "var(--kt-fs-12)",
          color: "var(--kt-fg-2)",
          lineHeight: "var(--kt-lh-body)",
          maxHeight: 120,
          overflowY: "auto",
          marginBottom: "var(--kt-s-3)",
          whiteSpace: "pre-wrap",
        }}
      >
        {formatPreview(approval.preview.content)}
      </div>

      {approval.deep_link && /^https?:\/\//.test(approval.deep_link) ? (
        <a href={approval.deep_link} target="_blank" rel="noopener noreferrer" className="kt-link" style={{ display: "block", marginBottom: "var(--kt-s-3)", fontSize: "var(--kt-fs-12)" }}>
          View in {approval.source_app} &rarr;
        </a>
      ) : null}

      <div style={{ display: "flex", gap: "var(--kt-s-2)" }}>
        <Button variant="accent" size="sm" style={{ flex: 1 }} onClick={() => onApprove(approval.id)}>Approve</Button>
        <Button variant="ghost" size="sm" onClick={() => onReject(approval.id)}>Reject</Button>
      </div>
    </Card>
  );
}

function formatPreview(content: Record<string, unknown>): string {
  if (typeof content.body === "string" && typeof content.subject === "string") {
    return `Subject: ${content.subject}\n\n${content.body}`;
  }
  if (typeof content.body === "string") return content.body;
  if (typeof content.content === "string") return content.content;
  return JSON.stringify(content, null, 2);
}
