"use client";

import { useState, useEffect } from "react";
import type { HvCampaign, CampaignStatus } from "@/types/campaigns";
import type { HvSequence } from "@/types/sequences";

interface CampaignDetailProps {
  campaign: HvCampaign;
  onClose: () => void;
  onUpdated: () => void;
}

const STATUS_COLORS: Record<CampaignStatus, { bg: string; fg: string }> = {
  draft: { bg: "rgba(155,155,167,0.10)", fg: "var(--text-secondary)" },
  active: { bg: "rgba(61,124,71,0.10)", fg: "var(--harvest-green)" },
  paused: { bg: "rgba(192,139,45,0.10)", fg: "var(--harvest-amber)" },
  completed: { bg: "rgba(139,115,85,0.10)", fg: "var(--harvest-soil)" },
};

export default function CampaignDetail({ campaign, onClose, onUpdated }: CampaignDetailProps) {
  const [name, setName] = useState(campaign.name);
  const [status, setStatus] = useState<CampaignStatus>(campaign.status);
  const [sequenceId, setSequenceId] = useState(campaign.sequence_id ?? "");
  const [prospectFilter, setProspectFilter] = useState(
    JSON.stringify(campaign.prospect_filter ?? {}, null, 2)
  );
  const [sequences, setSequences] = useState<HvSequence[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadSequences() {
      try {
        const res = await fetch("/api/hv/sequences?per_page=100");
        if (!res.ok) throw new Error(`Failed to load sequences: ${res.status}`);
        const json = await res.json();
        setSequences(json.data ?? []);
      } catch (err) {
        console.error("Error loading sequences:", err);
      }
    }
    loadSequences();
  }, []);

  async function handleSave() {
    let parsedFilter: Record<string, unknown> = {};
    try {
      parsedFilter = JSON.parse(prospectFilter);
    } catch {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/hv/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          status,
          sequence_id: sequenceId || null,
          prospect_filter: parsedFilter,
        }),
      });
      if (!res.ok) throw new Error(`Failed to save campaign: ${res.status}`);
      onUpdated();
    } catch (err) {
      console.error("Error saving campaign:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this campaign? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/hv/campaigns/${campaign.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to delete campaign: ${res.status}`);
      onUpdated();
    } catch (err) {
      console.error("Error deleting campaign:", err);
    }
  }

  const stats = campaign.stats ?? {};

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 560, backgroundColor: "var(--surface-elevated)",
      borderLeft: "1px solid var(--border-subtle)", zIndex: 1000, overflowY: "auto", padding: 24,
      boxShadow: "var(--shadow-overlay)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: "100%", fontSize: 20, fontWeight: 700, color: "var(--text-primary)",
              backgroundColor: "transparent", border: "none", outline: "none", padding: 0,
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {(["draft", "active", "paused", "completed"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                style={{
                  padding: "4px 10px", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: status === s ? `1px solid ${STATUS_COLORS[s].fg}` : "1px solid var(--border-subtle)",
                  backgroundColor: status === s ? STATUS_COLORS[s].bg : "transparent",
                  color: status === s ? STATUS_COLORS[s].fg : "var(--text-secondary)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <button onClick={onClose} style={{
          border: "none", background: "none", color: "var(--text-secondary)", fontSize: 20, cursor: "pointer",
        }}>x</button>
      </div>

      {/* Stats */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 12px" }}>
          Stats
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {([
            { label: "Enrolled", value: stats.enrolled ?? 0 },
            { label: "Sent", value: stats.sent ?? 0 },
            { label: "Opened", value: stats.opened ?? 0 },
            { label: "Replied", value: stats.replied ?? 0 },
            { label: "Bounced", value: stats.bounced ?? 0 },
          ] as const).map((stat) => (
            <div key={stat.label} style={{
              padding: 12, borderRadius: 8, border: "1px solid var(--border-subtle)",
              backgroundColor: "var(--surface-base)",
            }}>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>{stat.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sequence selector */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          Sequence
        </label>
        <select
          value={sequenceId}
          onChange={(e) => setSequenceId(e.target.value)}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
            border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
          }}
        >
          <option value="">No sequence</option>
          {sequences.map((seq) => (
            <option key={seq.id} value={seq.id}>{seq.name}</option>
          ))}
        </select>
      </div>

      {/* Prospect filter */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          Prospect filter (JSON)
        </label>
        <textarea
          value={prospectFilter}
          onChange={(e) => setProspectFilter(e.target.value)}
          rows={5}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 13,
            border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", outline: "none", resize: "vertical", boxSizing: "border-box",
            fontFamily: "monospace",
          }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
        <button
          onClick={handleDelete}
          style={{
            padding: "8px 16px", borderRadius: 6, border: "1px solid var(--border-subtle)",
            backgroundColor: "transparent", color: "var(--error, #d44040)", fontSize: 13, cursor: "pointer",
          }}
        >
          Delete
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "8px 20px", borderRadius: 6, border: "none", cursor: "pointer",
            backgroundColor: "var(--harvest-green)", color: "#fff", fontSize: 13, fontWeight: 600,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
