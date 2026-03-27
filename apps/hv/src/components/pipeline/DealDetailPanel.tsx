"use client";

import { useState, useEffect } from "react";
import { ActivityTimeline } from "@/components/contacts/ActivityTimeline";
import type { HvDeal, DealStage } from "@/types/pipeline";
import type { HvActivity } from "@/types/contacts";
import { getStageConfig, formatCurrency, getDealAge, DEAL_STAGES } from "@/types/pipeline";

interface DealDetailPanelProps {
  dealId: string;
  onClose: () => void;
  onDealUpdated: () => void;
  onCloseDeal: (deal: HvDeal) => void;
}

export function DealDetailPanel({ dealId, onClose, onDealUpdated, onCloseDeal }: DealDetailPanelProps) {
  const [deal, setDeal] = useState<HvDeal | null>(null);
  const [activities, setActivities] = useState<HvActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    fetch(`/api/hv/deals/${dealId}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setDeal(res.data);
          setActivities(res.data.activities ?? []);
          setNotes(res.data.notes ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, [dealId]);

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/hv/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (data.success) setDeal((prev) => prev ? { ...prev, notes } : prev);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleStageChange = async (newStage: DealStage) => {
    const res = await fetch(`/api/hv/deals/${dealId}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    });
    const data = await res.json();
    if (data.success) {
      setDeal((prev) => prev ? { ...prev, stage: newStage } : prev);
      onDealUpdated();
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this deal? This cannot be undone.")) return;
    const res = await fetch(`/api/hv/deals/${dealId}`, { method: "DELETE" });
    if (res.ok) {
      onClose();
      onDealUpdated();
    }
  };

  const stageConfig = deal ? getStageConfig(deal.stage) : null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.15)", zIndex: 200 }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 480,
          backgroundColor: "var(--surface-elevated)",
          borderLeft: "1px solid var(--border-default)",
          zIndex: 201,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-tertiary)" }}>Loading...</div>
        ) : !deal ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-tertiary)" }}>Deal not found.</div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                  {deal.name}
                </h2>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: stageConfig?.color }} />
                  <select
                    value={deal.stage}
                    onChange={(e) => {
                      const s = e.target.value as DealStage;
                      if (s === "closed_won" || s === "closed_lost") {
                        onCloseDeal(deal);
                      } else {
                        handleStageChange(s);
                      }
                    }}
                    aria-label="Deal stage"
                    style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      border: "1px solid var(--border-subtle)",
                      backgroundColor: "var(--surface-base)",
                      color: stageConfig?.color,
                      fontSize: "0.75rem",
                      fontWeight: 600,
                    }}
                  >
                    {DEAL_STAGES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: "1.25rem", padding: "4px" }}>
                ×
              </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Value */}
              {deal.value != null && (
                <div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "4px" }}>Value</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 600, fontFamily: "var(--font-mono, monospace), monospace", color: "var(--text-primary)" }}>
                    {formatCurrency(deal.value, deal.currency)}
                  </div>
                </div>
              )}

              {/* Info grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "0.8125rem" }}>
                {deal.contact && (
                  <div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", marginBottom: "2px" }}>Contact</div>
                    <a href={`/contacts/${deal.contact.id}`} style={{ color: "var(--harvest-green)", textDecoration: "none" }}>
                      {[deal.contact.first_name, deal.contact.last_name].filter(Boolean).join(" ")}
                    </a>
                  </div>
                )}
                {deal.organization && (
                  <div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", marginBottom: "2px" }}>Organization</div>
                    <div style={{ color: "var(--text-primary)" }}>{deal.organization.name}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", marginBottom: "2px" }}>Age</div>
                  <div style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono, monospace), monospace" }}>
                    {getDealAge(deal.created_at)} days
                  </div>
                </div>
                {deal.attribution_channel && (
                  <div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", marginBottom: "2px" }}>Channel</div>
                    <div style={{ color: "var(--text-primary)" }}>{deal.attribution_channel}</div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "6px" }}>Notes</div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  aria-label="Deal notes"
                  style={{
                    width: "100%",
                    minHeight: 80,
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "var(--surface-base)",
                    color: "var(--text-primary)",
                    fontSize: "0.8125rem",
                    resize: "vertical",
                    lineHeight: 1.6,
                  }}
                />
                {notes !== (deal.notes ?? "") && (
                  <button
                    onClick={saveNotes}
                    disabled={savingNotes}
                    style={{
                      marginTop: "6px",
                      padding: "5px 12px",
                      borderRadius: "4px",
                      border: "none",
                      backgroundColor: "var(--harvest-green)",
                      color: "#fff",
                      fontSize: "0.75rem",
                      cursor: savingNotes ? "wait" : "pointer",
                      opacity: savingNotes ? 0.6 : 1,
                    }}
                  >
                    {savingNotes ? "Saving..." : "Save"}
                  </button>
                )}
              </div>

              {/* Activity */}
              <div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "8px" }}>Activity</div>
                <ActivityTimeline activities={activities} />
              </div>
            </div>

            {/* Footer actions */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", gap: "8px" }}>
              <button
                onClick={() => onCloseDeal(deal)}
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-default)",
                  backgroundColor: "transparent",
                  color: "var(--text-primary)",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Close deal
              </button>
              <button
                onClick={handleDelete}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid var(--error, #d44040)",
                  backgroundColor: "transparent",
                  color: "var(--error, #d44040)",
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
