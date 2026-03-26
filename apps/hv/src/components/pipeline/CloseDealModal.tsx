"use client";

import { useState } from "react";
import type { HvDeal } from "@/types/pipeline";

type Outcome = "won" | "lost";

interface CloseDealModalProps {
  deal: HvDeal;
  initialOutcome?: Outcome;
  onClosed: () => void;
  onClose: () => void;
}

const WIN_REASONS = [
  { value: "product_fit", label: "Product fit" },
  { value: "price", label: "Price" },
  { value: "relationship", label: "Relationship" },
  { value: "timing", label: "Timing" },
  { value: "other", label: "Other" },
];

const LOSS_REASONS = [
  { value: "price", label: "Price" },
  { value: "competitor", label: "Lost to competitor" },
  { value: "no_budget", label: "No budget" },
  { value: "timing", label: "Bad timing" },
  { value: "product_gap", label: "Product gap" },
  { value: "went_dark", label: "Went dark" },
  { value: "other", label: "Other" },
];

export function CloseDealModal({ deal, initialOutcome, onClosed, onClose }: CloseDealModalProps) {
  const [outcome, setOutcome] = useState<Outcome>(initialOutcome ?? "won");
  const [reasonCategory, setReasonCategory] = useState("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [competitor, setCompetitor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!reasonCategory) { setError("Select a reason."); return; }
    setSubmitting(true);
    setError("");

    const stage = outcome === "won" ? "closed_won" : "closed_lost";
    const payload: Record<string, unknown> = {
      stage,
      closed_at: new Date().toISOString(),
    };

    if (outcome === "won") {
      payload.win_reason_category = reasonCategory;
      payload.win_reason_detail = reasonDetail || null;
    } else {
      payload.loss_reason_category = reasonCategory;
      payload.loss_reason_detail = reasonDetail || null;
      if (competitor) payload.lost_to_competitor = competitor;
    }

    try {
      // First: save metadata (reason, competitor, etc.)
      const metaRes = await fetch(`/api/hv/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const metaData = await metaRes.json();
      if (!metaData.success) {
        setError(metaData.error || "Failed to save close details");
        return;
      }

      // Second: update stage for activity logging (only after metadata saved)
      const stageRes = await fetch(`/api/hv/deals/${deal.id}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const stageData = await stageRes.json();
      if (!stageData.success) {
        setError(stageData.error || "Failed to update stage");
        return;
      }

      onClosed();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const reasons = outcome === "won" ? WIN_REASONS : LOSS_REASONS;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid var(--border-default)",
    backgroundColor: "var(--surface-base)",
    color: "var(--text-primary)",
    fontSize: "0.8125rem",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: "4px",
    display: "block",
  };

  const tabStyle = (active: boolean, color: string): React.CSSProperties => ({
    flex: 1,
    padding: "8px",
    borderRadius: "6px",
    border: active ? `1px solid ${color}` : "1px solid var(--border-default)",
    backgroundColor: active ? `${color}15` : "transparent",
    color: active ? color : "var(--text-tertiary)",
    fontSize: "0.8125rem",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center",
  });

  return (
    <div
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "24px", width: "100%", maxWidth: 440 }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
          Close Deal
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "20px" }}>
          {deal.name}
        </p>

        {/* Won/Lost toggle */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <button
            onClick={() => { setOutcome("won"); setReasonCategory(""); }}
            style={tabStyle(outcome === "won", "var(--success, #3d8f46)")}
          >
            Won
          </button>
          <button
            onClick={() => { setOutcome("lost"); setReasonCategory(""); }}
            style={tabStyle(outcome === "lost", "var(--error, #d44040)")}
          >
            Lost
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label htmlFor="cdm-reason" style={labelStyle}>Reason *</label>
            <select
              id="cdm-reason"
              style={inputStyle}
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
            >
              <option value="">Select a reason...</option>
              {reasons.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="cdm-detail" style={labelStyle}>Details</label>
            <textarea
              id="cdm-detail"
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              placeholder="Add context..."
            />
          </div>

          {outcome === "lost" && (
            <div>
              <label htmlFor="cdm-competitor" style={labelStyle}>Lost to competitor</label>
              <input
                id="cdm-competitor"
                style={inputStyle}
                value={competitor}
                onChange={(e) => setCompetitor(e.target.value)}
                placeholder="Competitor name"
              />
            </div>
          )}
        </div>

        {error && <p style={{ color: "var(--error, #d44040)", fontSize: "0.8125rem", marginTop: "12px" }}>{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid var(--border-default)", backgroundColor: "transparent", color: "var(--text-secondary)", fontSize: "0.8125rem", cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              backgroundColor: outcome === "won" ? "var(--success, #3d8f46)" : "var(--error, #d44040)",
              color: "#fff",
              fontSize: "0.8125rem",
              fontWeight: 500,
              cursor: submitting ? "wait" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Closing..." : outcome === "won" ? "Mark as Won" : "Mark as Lost"}
          </button>
        </div>
      </div>
    </div>
  );
}
