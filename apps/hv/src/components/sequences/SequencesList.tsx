"use client";

import { useState, useEffect, useCallback } from "react";
import type { HvSequence, SequenceStatus } from "@/types/sequences";

interface SequencesListProps {
  onSelect: (sequence: HvSequence) => void;
  onCreateClick: () => void;
}

const STATUS_COLORS: Record<SequenceStatus, { bg: string; fg: string }> = {
  draft: { bg: "rgba(155,155,167,0.12)", fg: "var(--text-secondary)" },
  active: { bg: "rgba(0,206,201,0.12)", fg: "#00CEC9" },
  paused: { bg: "rgba(253,203,110,0.12)", fg: "#FDCB6E" },
  archived: { bg: "rgba(255,118,117,0.12)", fg: "#FF7675" },
};

export default function SequencesList({ onSelect, onCreateClick }: SequencesListProps) {
  const [sequences, setSequences] = useState<HvSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SequenceStatus | "">("");

  const fetchSequences = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set("status", filter);
    const res = await fetch(`/api/hv/sequences?${params}`);
    const json = await res.json();
    setSequences(json.data ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchSequences(); }, [fetchSequences]);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Sequences</h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "4px 0 0" }}>
            Multi-step email outreach workflows
          </p>
        </div>
        <button
          onClick={onCreateClick}
          style={{
            padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
            backgroundColor: "var(--accent-primary)", color: "#0f0f0d", fontSize: 13, fontWeight: 600,
          }}
        >
          + New Sequence
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["", "draft", "active", "paused", "archived"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border-subtle)",
              backgroundColor: filter === s ? "var(--surface-raised)" : "transparent",
              color: filter === s ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading...</p>
      ) : sequences.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 60, color: "var(--text-secondary)",
          border: "1px dashed var(--border-subtle)", borderRadius: 12,
        }}>
          <p style={{ fontSize: 15, margin: "0 0 8px" }}>No sequences yet</p>
          <p style={{ fontSize: 13, margin: 0 }}>Create your first outreach sequence to get started.</p>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              {["Name", "Steps", "Status", "Enrolled", "Replied", "Updated"].map((h) => (
                <th key={h} style={{
                  textAlign: "left", padding: "8px 12px", fontSize: 12, fontWeight: 600,
                  color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em",
                  borderBottom: "1px solid var(--border-subtle)",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sequences.map((seq) => {
              const steps = Array.isArray(seq.steps) ? seq.steps : [];
              const statusColor = STATUS_COLORS[seq.status] ?? STATUS_COLORS.draft;
              return (
                <tr
                  key={seq.id}
                  onClick={() => onSelect(seq)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--surface-raised)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                >
                  <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500, borderBottom: "1px solid var(--border-subtle)" }}>
                    {seq.name}
                  </td>
                  <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                    {steps.length} step{steps.length !== 1 ? "s" : ""}
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 4,
                      fontSize: 12, fontWeight: 600, backgroundColor: statusColor.bg, color: statusColor.fg,
                    }}>
                      {seq.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                    {seq.stats?.enrolled ?? 0}
                  </td>
                  <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                    {seq.stats?.replied ?? 0}
                  </td>
                  <td style={{ padding: "10px 12px", color: "var(--text-tertiary)", fontSize: 13, borderBottom: "1px solid var(--border-subtle)" }}>
                    {new Date(seq.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
