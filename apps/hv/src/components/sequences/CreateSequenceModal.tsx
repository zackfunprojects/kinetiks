"use client";

import { useState } from "react";

interface CreateSequenceModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateSequenceModal({ onClose, onCreated }: CreateSequenceModalProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/hv/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          steps: [
            { id: crypto.randomUUID(), type: "email", order: 0, subject_line: "", template: "" },
            { id: crypto.randomUUID(), type: "delay", order: 1, delay_days: 2 },
            { id: crypto.randomUUID(), type: "email", order: 2, subject_line: "", template: "" },
          ],
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to create sequence");
        return;
      }

      onCreated();
    } catch (err) {
      console.error("Error creating sequence:", err);
      setError("Failed to create sequence");
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
          padding: 24, width: 440, boxShadow: "var(--shadow-overlay)",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 16px" }}>
          New Sequence
        </h2>

        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          Sequence name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Cold outreach - SaaS founders"
          autoFocus
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
            border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
          }}
        />

        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "8px 0 0" }}>
          A 3-step sequence (email, 2-day delay, follow-up) will be created. You can customize steps after.
        </p>

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
            {saving ? "Creating..." : "Create Sequence"}
          </button>
        </div>
      </div>
    </div>
  );
}
