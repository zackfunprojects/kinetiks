"use client";

import { useState, useEffect } from "react";
import type { HvSequence } from "@/types/sequences";

interface CreateCampaignModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateCampaignModal({ onClose, onCreated }: CreateCampaignModalProps) {
  const [name, setName] = useState("");
  const [sequenceId, setSequenceId] = useState("");
  const [prospectFilter, setProspectFilter] = useState("{}");
  const [sequences, setSequences] = useState<HvSequence[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  async function handleCreate() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    let parsedFilter: Record<string, unknown> = {};
    try {
      parsedFilter = JSON.parse(prospectFilter);
    } catch {
      setError("Prospect filter must be valid JSON");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/hv/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          sequence_id: sequenceId || null,
          prospect_filter: parsedFilter,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to create campaign");
        return;
      }

      onCreated();
    } catch (err) {
      console.error("Error creating campaign:", err);
      setError("Failed to create campaign");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--surface-elevated)", borderRadius: 12,
          padding: 24, width: 480, boxShadow: "var(--shadow-overlay)",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 16px" }}>
          New Campaign
        </h2>

        {/* Name */}
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          Campaign name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Q1 SaaS Outreach"
          autoFocus
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
            border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
          }}
        />

        {/* Sequence */}
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, marginTop: 16 }}>
          Sequence (optional)
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

        {/* Prospect filter */}
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, marginTop: 16 }}>
          Prospect filter (JSON)
        </label>
        <textarea
          value={prospectFilter}
          onChange={(e) => setProspectFilter(e.target.value)}
          rows={3}
          placeholder='e.g. {"seniority": "director", "industry": "SaaS"}'
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 13,
            border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", outline: "none", resize: "vertical", boxSizing: "border-box",
            fontFamily: "monospace",
          }}
        />

        {error && <p style={{ fontSize: 13, color: "var(--error, #d44040)", margin: "12px 0 0" }}>{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px", borderRadius: 6, border: "1px solid var(--border-subtle)",
              backgroundColor: "transparent", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            style={{
              padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer",
              backgroundColor: "var(--harvest-green)", color: "#fff", fontSize: 13, fontWeight: 600,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Creating..." : "Create Campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}
