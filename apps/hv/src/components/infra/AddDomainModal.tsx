"use client";

import { useState } from "react";

interface AddDomainModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function AddDomainModal({ onClose, onCreated }: AddDomainModalProps) {
  const [domain, setDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!domain.trim()) { setError("Domain is required"); return; }

    setSaving(true);
    setError("");

    const res = await fetch("/api/hv/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: domain.trim() }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to add domain");
      setSaving(false);
      return;
    }

    onCreated();
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--surface-raised)", borderRadius: 12,
          padding: 24, width: 440, border: "1px solid var(--border-subtle)",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 16px" }}>
          Add Domain
        </h2>

        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          Domain
        </label>
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="e.g. outreach.company.com"
          autoFocus
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
            border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
          }}
        />

        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "8px 0 0" }}>
          You will need to configure DNS records after adding the domain.
        </p>

        {error && <p style={{ fontSize: 13, color: "#FF7675", margin: "12px 0 0" }}>{error}</p>}

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
              backgroundColor: "var(--accent-primary)", color: "#0f0f0d", fontSize: 13, fontWeight: 600,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Adding..." : "Add Domain"}
          </button>
        </div>
      </div>
    </div>
  );
}
