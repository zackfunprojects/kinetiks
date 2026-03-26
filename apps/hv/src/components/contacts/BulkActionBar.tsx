"use client";

import { useState } from "react";

interface BulkActionBarProps {
  selectedCount: number;
  selectedIds: string[];
  onComplete: () => void;
  onClear: () => void;
}

export function BulkActionBar({ selectedCount, selectedIds, onComplete, onClear }: BulkActionBarProps) {
  const [loading, setLoading] = useState(false);

  if (selectedCount === 0) return null;

  const handleSuppress = async () => {
    if (!confirm(`Suppress ${selectedCount} contact${selectedCount > 1 ? "s" : ""}? This cannot be undone.`)) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/hv/contacts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, action: "suppress" }),
      });
      if (res.ok) {
        onComplete();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Failed to suppress contacts");
      }
    } catch {
      alert("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "var(--surface-elevated)",
        border: "1px solid var(--border-default)",
        borderRadius: "10px",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        zIndex: 100,
      }}
    >
      <span
        style={{
          fontSize: "0.8125rem",
          fontWeight: 500,
          color: "var(--text-primary)",
          fontFamily: "var(--font-mono, monospace), monospace",
        }}
      >
        {selectedCount} selected
      </span>

      <div style={{ width: 1, height: 20, backgroundColor: "var(--border-default)" }} />

      <button
        onClick={handleSuppress}
        disabled={loading}
        style={{
          padding: "6px 12px",
          borderRadius: "6px",
          border: "1px solid var(--error, #d44040)",
          backgroundColor: "transparent",
          color: "var(--error, #d44040)",
          fontSize: "0.75rem",
          fontWeight: 500,
          cursor: loading ? "wait" : "pointer",
        }}
      >
        Suppress
      </button>

      <button
        onClick={onClear}
        style={{
          padding: "6px 12px",
          borderRadius: "6px",
          border: "1px solid var(--border-default)",
          backgroundColor: "transparent",
          color: "var(--text-secondary)",
          fontSize: "0.75rem",
          cursor: "pointer",
        }}
      >
        Clear
      </button>
    </div>
  );
}
