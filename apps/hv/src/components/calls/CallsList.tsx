"use client";

import { useState, useEffect, useCallback } from "react";
import type { HvCall, CallStatus } from "@/types/calls";

interface CallsListProps {
  onSelect: (call: HvCall) => void;
  onLogClick: () => void;
  onAiCallClick?: () => void;
}

const STATUS_COLORS: Record<CallStatus, { bg: string; fg: string }> = {
  scheduled: { bg: "rgba(139,115,85,0.10)", fg: "var(--harvest-soil)" },
  in_progress: { bg: "rgba(192,139,45,0.10)", fg: "var(--harvest-amber)" },
  completed: { bg: "rgba(61,124,71,0.10)", fg: "var(--harvest-green)" },
  failed: { bg: "rgba(212,64,64,0.10)", fg: "var(--error, #d44040)" },
  cancelled: { bg: "rgba(155,155,167,0.10)", fg: "var(--text-secondary)" },
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function CallsList({ onSelect, onLogClick, onAiCallClick }: CallsListProps) {
  const [calls, setCalls] = useState<HvCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CallStatus | "">("");

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("status", filter);
      const res = await fetch(`/api/hv/calls?${params}`);
      if (!res.ok) throw new Error(`Failed to fetch calls: ${res.status}`);
      const json = await res.json();
      setCalls(json.data ?? []);
    } catch (err) {
      console.error("Error fetching calls:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchCalls(); }, [fetchCalls]);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Calls</h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "4px 0 0" }}>
            AI-powered voice calls with automatic transcription and key moment extraction
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {onAiCallClick && (
            <button
              onClick={onAiCallClick}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                backgroundColor: "var(--harvest-green)", color: "#fff", fontSize: 13, fontWeight: 600,
              }}
            >
              Start AI Call
            </button>
          )}
          <button
            onClick={onLogClick}
            style={{
              padding: "8px 16px", borderRadius: 8, cursor: "pointer",
              border: "1px solid var(--border-default)", backgroundColor: "transparent",
              color: "var(--text-secondary)", fontSize: 13, fontWeight: 500,
            }}
          >
            + Log Call
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["", "scheduled", "in_progress", "completed", "failed", "cancelled"] as const).map((s) => (
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
            {s ? s.replace("_", " ") : "All"}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading...</p>
      ) : calls.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 60, color: "var(--text-secondary)",
          border: "1px dashed var(--border-subtle)", borderRadius: 12,
        }}>
          <p style={{ fontSize: 15, margin: "0 0 8px" }}>No calls yet</p>
          <p style={{ fontSize: 13, margin: 0 }}>Log your first call to start tracking activity.</p>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              {["Phone To", "Status", "Outcome", "Duration", "Date"].map((h) => (
                <th key={h} style={{
                  textAlign: "left", padding: "8px 12px", fontSize: 12, fontWeight: 600,
                  color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em",
                  borderBottom: "1px solid var(--border-subtle)",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => {
              const statusColor = STATUS_COLORS[call.status] ?? STATUS_COLORS.completed;
              return (
                <tr
                  key={call.id}
                  onClick={() => onSelect(call)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--surface-raised)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                >
                  <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500, borderBottom: "1px solid var(--border-subtle)" }}>
                    {call.phone_to}
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 4,
                      fontSize: 12, fontWeight: 600, backgroundColor: statusColor.bg, color: statusColor.fg,
                    }}>
                      {call.status.replace("_", " ")}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                    {call.outcome ? call.outcome.replace("_", " ") : "-"}
                  </td>
                  <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                    {formatDuration(call.duration_seconds)}
                  </td>
                  <td style={{ padding: "10px 12px", color: "var(--text-tertiary)", fontSize: 13, borderBottom: "1px solid var(--border-subtle)" }}>
                    {new Date(call.created_at).toLocaleDateString()}
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
