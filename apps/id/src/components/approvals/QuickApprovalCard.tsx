"use client";

import { Card, Button, StatusPill, ConfidenceRing } from "@kinetiks/ui";
import type { ApprovalRecord } from "@/lib/approvals/types";
import { categoryThreshold, confidenceFraction } from "./confidence";

interface QuickApprovalCardProps {
  approval: ApprovalRecord;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function QuickApprovalCard({ approval, onApprove, onReject }: QuickApprovalCardProps) {
  const threshold = categoryThreshold(approval.action_category);
  const body = formatBody(approval.preview.content) || approval.description;

  return (
    <Card style={{ marginBottom: "var(--kt-s-2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--kt-s-2)", marginBottom: "var(--kt-s-2)" }}>
        <StatusPill tone="accent">Quick</StatusPill>
        <span className="kt-small">{approval.source_app}</span>
        {approval.confidence_score !== null ? (
          <span style={{ marginLeft: "auto" }}>
            <ConfidenceRing
              value={confidenceFraction(approval.confidence_score)}
              threshold={threshold}
              showThresholdTick
              showLabel
              size="md"
              ariaLabel={`Confidence ${Math.round(approval.confidence_score)} percent`}
            />
          </span>
        ) : null}
      </div>

      <div className="kt-card-title" style={{ marginBottom: "var(--kt-s-1)" }}>{approval.title}</div>
      {body ? (
        <div className="kt-small" style={{ marginBottom: "var(--kt-s-3)", whiteSpace: "pre-wrap", lineHeight: "var(--kt-lh-body)" }}>{body}</div>
      ) : null}

      <div style={{ display: "flex", gap: "var(--kt-s-2)" }}>
        <Button variant="accent" size="sm" style={{ flex: 1 }} onClick={() => onApprove(approval.id)}>Approve</Button>
        <Button variant="ghost" size="sm" onClick={() => onReject(approval.id)}>Reject</Button>
      </div>
    </Card>
  );
}

function formatBody(content: Record<string, unknown>): string | null {
  if (typeof content.body === "string") return content.body;
  if (typeof content.content === "string") return content.content;
  return null;
}
