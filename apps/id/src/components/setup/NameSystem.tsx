"use client";

import { useState } from "react";

interface NameSystemProps {
  accountId: string;
  initialName: string;
  onComplete: (name: string) => void;
}

export function NameSystem({ accountId, initialName, onComplete }: NameSystemProps) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please give your system a name");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_name: trimmed }),
      });

      if (!res.ok) {
        throw new Error("Failed to save");
      }

      onComplete(trimmed);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const displayName = name.trim() || "your system";

  return (
    <div>
      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: "var(--kt-fg-1)",
          margin: "0 0 8px",
          textAlign: "center",
        }}
      >
        Name your GTM system
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--kt-fg-2)",
          margin: "0 0 32px",
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        This is what talks to you in Chat, shows up in Slack, and sends your emails.
      </p>

      <div style={{ marginBottom: 24 }}>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="Kit, Archer, Vanguard..."
          autoFocus
          style={{
            width: "100%",
            padding: "14px 16px",
            border: "1px solid var(--kt-border-1)",
            borderRadius: 8,
            fontSize: 18,
            fontWeight: 500,
            outline: "none",
            boxSizing: "border-box",
            backgroundColor: "var(--kt-bg-base)",
            color: "var(--kt-fg-1)",
            textAlign: "center",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
        />
        {error && (
          <p style={{ fontSize: 13, color: "var(--kt-danger)", marginTop: 8, textAlign: "center" }}>
            {error}
          </p>
        )}
      </div>

      {/* Live previews */}
      {name.trim() && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 32,
            padding: 16,
            borderRadius: 8,
            border: "1px solid var(--kt-border-2)",
            background: "var(--kt-bg-subtle)",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--kt-fg-3)", fontFamily: "var(--font-mono), monospace", marginBottom: 4 }}>
            Preview
          </div>
          <PreviewRow label="Chat" value={`${displayName}: "Here's your morning brief..."`} />
          <PreviewRow label="Slack" value={`@${displayName.toLowerCase().replace(/\s+/g, "-")} posted in #marketing`} />
          <PreviewRow label="Email" value={`From: ${displayName} <notifications@kinetiks.ai>`} />
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={saving || !name.trim()}
        style={{
          width: "100%",
          padding: "12px 24px",
          borderRadius: 8,
          border: "none",
          fontSize: 15,
          fontWeight: 500,
          cursor: saving || !name.trim() ? "not-allowed" : "pointer",
          backgroundColor: saving || !name.trim() ? "var(--kt-border-1)" : "var(--kt-accent-hover)",
          color: saving || !name.trim() ? "var(--kt-fg-3)" : "var(--kt-fg-on-inverse)",
        }}
      >
        {saving ? "Saving..." : "Continue"}
      </button>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
      <span
        style={{
          fontSize: 11,
          color: "var(--kt-fg-3)",
          fontFamily: "var(--font-mono), monospace",
          width: 48,
          flexShrink: 0,
          textAlign: "right",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 13, color: "var(--kt-fg-2)" }}>{value}</span>
    </div>
  );
}
