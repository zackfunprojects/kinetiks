"use client";

import { useState } from "react";

interface EnrichDomainModalProps {
  onComplete: () => void;
  onClose: () => void;
}

export function EnrichDomainModal({ onComplete, onClose }: EnrichDomainModalProps) {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ contacts_found: number; contacts_saved: number } | null>(null);

  const handleSubmit = async () => {
    if (!domain.trim()) {
      setError("Enter a domain.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/hv/scout/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Enrichment failed");
        return;
      }
      setResult({
        contacts_found: data.data.contacts_found,
        contacts_saved: data.data.contacts_saved,
      });
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          backgroundColor: "var(--surface-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: "12px",
          padding: "24px",
          width: "100%",
          maxWidth: 420,
        }}
      >
        <h2
          style={{
            fontSize: "1.125rem",
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: "8px",
          }}
        >
          Enrich domain
        </h2>
        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--text-secondary)",
            marginBottom: "20px",
            lineHeight: 1.5,
          }}
        >
          Enter a company domain to discover contacts. This may take 15-30 seconds.
        </p>

        {!result ? (
          <>
            <input
              type="text"
              placeholder="e.g. acme.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleSubmit(); }}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "6px",
                border: "1px solid var(--border-default)",
                backgroundColor: "var(--surface-base)",
                color: "var(--text-primary)",
                fontSize: "0.875rem",
                fontFamily: "var(--font-mono, monospace), monospace",
                outline: "none",
                marginBottom: "12px",
              }}
              autoFocus
              disabled={loading}
            />

            {error && (
              <p style={{ color: "var(--error, #d44040)", fontSize: "0.8125rem", marginBottom: "12px" }}>
                {error}
              </p>
            )}

            {loading && (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", marginBottom: "12px" }}>
                Enriching {domain}...
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                onClick={onClose}
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-default)",
                  backgroundColor: "transparent",
                  color: "var(--text-secondary)",
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || !domain.trim()}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "var(--accent-primary)",
                  color: "#fff",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  cursor: loading ? "wait" : "pointer",
                  opacity: loading || !domain.trim() ? 0.7 : 1,
                }}
              >
                {loading ? "Enriching..." : "Enrich"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                padding: "16px",
                borderRadius: "8px",
                backgroundColor: "rgba(90,173,98,0.08)",
                border: "1px solid rgba(90,173,98,0.2)",
                marginBottom: "16px",
              }}
            >
              <p style={{ fontSize: "0.875rem", color: "var(--text-primary)", fontWeight: 500 }}>
                Found {result.contacts_found} contacts, saved {result.contacts_saved}.
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => { onComplete(); onClose(); }}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "var(--accent-primary)",
                  color: "#fff",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                View contacts
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
