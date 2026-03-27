"use client";

import { useState } from "react";
import type { HvCall, CallStatus, CallOutcome } from "@/types/calls";

interface CallDetailProps {
  call: HvCall;
  onClose: () => void;
  onUpdated: () => void;
}

const STATUS_COLORS: Record<CallStatus, { bg: string; fg: string }> = {
  scheduled: { bg: "rgba(108,92,231,0.12)", fg: "#6C5CE7" },
  in_progress: { bg: "rgba(253,203,110,0.12)", fg: "#FDCB6E" },
  completed: { bg: "rgba(0,206,201,0.12)", fg: "#00CEC9" },
  failed: { bg: "rgba(255,118,117,0.12)", fg: "#FF7675" },
  cancelled: { bg: "rgba(155,155,167,0.12)", fg: "var(--text-secondary)" },
};

const OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: "connected", label: "Connected" },
  { value: "voicemail", label: "Voicemail" },
  { value: "no_answer", label: "No Answer" },
  { value: "busy", label: "Busy" },
  { value: "wrong_number", label: "Wrong Number" },
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function CallDetail({ call, onClose, onUpdated }: CallDetailProps) {
  const [outcome, setOutcome] = useState<CallOutcome | "">(call.outcome ?? "");
  const [transcript, setTranscript] = useState(call.transcript ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/hv/calls/${call.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome: outcome || null,
          transcript: transcript.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`Failed to save call: ${res.status}`);
      onUpdated();
    } catch (err) {
      console.error("Error saving call:", err);
    } finally {
      setSaving(false);
    }
  }

  const statusColor = STATUS_COLORS[call.status] ?? STATUS_COLORS.completed;
  const keyMoments = Array.isArray(call.key_moments) ? call.key_moments : [];

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 560, backgroundColor: "var(--surface-raised)",
      borderLeft: "1px solid var(--border-subtle)", zIndex: 1000, overflowY: "auto", padding: 24,
      boxShadow: "-4px 0 24px rgba(0,0,0,0.3)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            Call to {call.phone_to}
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
            From {call.phone_from}
          </p>
        </div>
        <button onClick={onClose} style={{
          border: "none", background: "none", color: "var(--text-secondary)", fontSize: 20, cursor: "pointer",
        }}>x</button>
      </div>

      {/* Info grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24,
        padding: 16, borderRadius: 8, backgroundColor: "var(--surface-base)",
        border: "1px solid var(--border-subtle)",
      }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Status
          </span>
          <div style={{ marginTop: 4 }}>
            <span style={{
              display: "inline-block", padding: "2px 8px", borderRadius: 4,
              fontSize: 12, fontWeight: 600, backgroundColor: statusColor.bg, color: statusColor.fg,
            }}>
              {call.status.replace("_", " ")}
            </span>
          </div>
        </div>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Duration
          </span>
          <p style={{ fontSize: 14, color: "var(--text-primary)", margin: "4px 0 0" }}>
            {formatDuration(call.duration_seconds)}
          </p>
        </div>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Type
          </span>
          <p style={{ fontSize: 14, color: "var(--text-primary)", margin: "4px 0 0" }}>
            {call.call_type.replace("_", " ")}
          </p>
        </div>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Date
          </span>
          <p style={{ fontSize: 14, color: "var(--text-primary)", margin: "4px 0 0" }}>
            {new Date(call.created_at).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Outcome selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          Outcome
        </label>
        <select
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as CallOutcome)}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
            border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
          }}
        >
          <option value="">Select outcome...</option>
          {OUTCOMES.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Transcript */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          Transcript
        </label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Add call transcript..."
          rows={6}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
            border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", outline: "none", resize: "vertical", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Key moments */}
      {keyMoments.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>
            Key Moments ({keyMoments.length})
          </h3>
          {keyMoments.map((moment, idx) => (
            <div key={idx} style={{
              padding: 12, borderRadius: 6, border: "1px solid var(--border-subtle)",
              backgroundColor: "var(--surface-base)", marginBottom: 6, fontSize: 13,
              color: "var(--text-secondary)",
            }}>
              {typeof moment === "string" ? moment : JSON.stringify(moment)}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "8px 20px", borderRadius: 6, border: "none", cursor: "pointer",
            backgroundColor: "var(--accent-primary)", color: "#0f0f0d", fontSize: 13, fontWeight: 600,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
