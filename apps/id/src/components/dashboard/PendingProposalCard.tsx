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
          variant="purple"
        />
        <Badge label={proposal.action} />
        {proposal.source_app && (
          <span style={{ fontSize: 11, color: "#999" }}>
            from {proposal.source_app.replace("_", " ")}
          </span>
        )}
      </div>

      {previewEntries.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {previewEntries.map(([key, value]) => (
            <div key={key} style={{ fontSize: 13, color: "#4B5563", marginBottom: 2 }}>
              <span style={{ color: "#999" }}>{key}:</span>{" "}
              {typeof value === "string"
                ? value.length > 80
                  ? `${value.slice(0, 80)}...`
                  : value
                : JSON.stringify(value).slice(0, 80)}
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
          <span style={{ fontSize: 11, color: "#999" }}>
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
            background: "#6C5CE7",
            color: "#fff",
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
            background: "#fff",
            color: "#374151",
            border: "1px solid #E5E7EB",
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
