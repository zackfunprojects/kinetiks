"use client";

import { useState } from "react";
import type { Proposal } from "@kinetiks/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LAYER_DISPLAY_NAMES } from "@/lib/utils/layer-display";

interface PendingProposalCardProps {
  proposal: Proposal;
  onDecision: (id: string, decision: "accept" | "decline") => void;
}

export function PendingProposalCard({
  proposal,
  onDecision,
}: PendingProposalCardProps) {
  const [loading, setLoading] = useState(false);

  async function handleDecision(decision: "accept" | "decline") {
    setLoading(true);
    try {
      const res = await fetch("/api/cortex/evaluate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal_id: proposal.id,
          decision,
        }),
      });
      if (res.ok) {
        onDecision(proposal.id, decision);
      }
    } finally {
      setLoading(false);
    }
  }

  const payload = proposal.payload as Record<string, unknown>;
  const previewEntries = Object.entries(payload).slice(0, 3);

  return (
    <Card style={{ opacity: loading ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Badge
          label={LAYER_DISPLAY_NAMES[proposal.target_layer] || proposal.target_layer}
          variant="accent"
        />
        <Badge label={proposal.action} />
        {proposal.source_app && (
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono), monospace" }}>
            from {proposal.source_app.replace("_", " ")}
          </span>
        )}
      </div>

      {previewEntries.length > 0 && (
        <div
          style={{
            marginBottom: 12,
            padding: "8px 10px",
            background: "var(--bg-inset)",
            borderRadius: 4,
            border: "1px solid var(--border-muted)",
          }}
        >
          {previewEntries.map(([key, value]) => (
            <div
              key={key}
              style={{
                fontSize: 12,
                fontFamily: "var(--font-mono), monospace",
                marginBottom: 2,
                lineHeight: 1.5,
              }}
            >
              <span style={{ color: "var(--text-tertiary)" }}>{key}:</span>{" "}
              <span style={{ color: "var(--text-primary)" }}>
                {typeof value === "string"
                  ? value.length > 80
                    ? `${value.slice(0, 80)}...`
                    : value
                  : JSON.stringify(value).slice(0, 80)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Badge
          label={proposal.confidence}
          variant={
            proposal.confidence === "validated"
              ? "success"
              : proposal.confidence === "inferred"
              ? "warning"
              : "default"
          }
        />
        {proposal.evidence && proposal.evidence.length > 0 && (
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono), monospace" }}>
            {proposal.evidence.length} evidence item{proposal.evidence.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          onClick={() => handleDecision("accept")}
          disabled={loading}
          style={{
            padding: "6px 14px",
            background: "var(--accent-emphasis)",
            color: "var(--text-on-accent)",
            border: "none",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          Accept
        </button>
        <button
          onClick={() => handleDecision("decline")}
          disabled={loading}
          style={{
            padding: "6px 14px",
            background: "transparent",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          Dismiss
        </button>
      </div>
    </Card>
  );
}
