"use client";

import Link from "next/link";
import { Card, Button, StatusPill, ConfidenceRing } from "@kinetiks/ui";
import type { ApprovalRecord } from "@/lib/approvals/types";
import { categoryThreshold, confidenceFraction } from "./confidence";

interface StrategicApprovalCardProps {
  approval: ApprovalRecord;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  systemName: string | null;
}

export function StrategicApprovalCard({ approval, onApprove, onReject, systemName }: StrategicApprovalCardProps) {
  const threshold = categoryThreshold(approval.action_category);
  const b = approval.confidence_breakdown;

  return (
    <Card variant="accent" style={{ marginBottom: "var(--kt-s-2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--kt-s-2)", marginBottom: "var(--kt-s-2)" }}>
        <StatusPill tone="danger">Strategic</StatusPill>
        <span className="kt-small">{approval.source_app}</span>
        {approval.confidence_score !== null ? (
          <span style={{ marginLeft: "auto" }}>
            <ConfidenceRing
              value={confidenceFraction(approval.confidence_score)}
              threshold={threshold}
              showThresholdTick
              showLabel
              size="md"
              ariaLabel={`Confidence ${Math.round(approval.confidence_score)} percent versus ${Math.round(threshold * 100)} percent threshold`}
            />
          </span>
        ) : null}
      </div>

      <div className="kt-card-title" style={{ marginBottom: "var(--kt-s-2)" }}>{approval.title}</div>

      {approval.description ? (
        <div
          className="kt-small"
          style={{
            marginBottom: "var(--kt-s-3)",
            padding: "var(--kt-s-3)",
            borderRadius: "var(--kt-radius-1)",
            background: "var(--kt-bg-subtle)",
            border: "1px solid var(--kt-border-1)",
            lineHeight: "var(--kt-lh-body)",
          }}
        >
          {approval.description}
        </div>
      ) : null}

      {b ? (
        <div className="kt-data-inline" style={{ color: "var(--kt-fg-3)", marginBottom: "var(--kt-s-3)" }}>
          Cortex {b.cortex} · Category {b.category} · Specificity {b.specificity} · Agent {b.agent}
        </div>
      ) : null}

      <Link href="/chat" className="kt-link" style={{ display: "block", marginBottom: "var(--kt-s-3)", fontSize: "var(--kt-fs-12)" }}>
        Discuss with {systemName || "your system"} &rarr;
      </Link>

      <div style={{ display: "flex", gap: "var(--kt-s-2)" }}>
        <Button variant="accent" size="sm" style={{ flex: 1 }} onClick={() => onApprove(approval.id)}>Approve</Button>
        <Button variant="danger" size="sm" style={{ flex: 1 }} onClick={() => onReject(approval.id)}>Reject</Button>
      </div>
    </Card>
  );
}
