"use client";

import { useState } from "react";

interface EnrichmentResult {
  company: { name: string; industry?: string; size?: number } | null;
  contacts_found: number;
  contacts_saved: number;
  contacts: Array<{ id: string; name: string; email: string }>;
}

interface FirstEnrichmentStepProps {
  submitting: boolean;
  onComplete: (domain: string) => void;
}

export default function FirstEnrichmentStep({ submitting, onComplete }: FirstEnrichmentStepProps) {
  const [domain, setDomain] = useState("");
  const [enriching, setEnriching] = useState(false);
  const [result, setResult] = useState<EnrichmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleEnrich() {
    if (!domain.trim()) return;
    setEnriching(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/hv/scout/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim() }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Enrichment failed");
        return;
      }
      const json = await res.json();
      setResult(json.data as EnrichmentResult);
    } catch (err) {
      console.error("Enrichment failed:", err);
      setError("Enrichment failed. Please try again.");
    } finally {
      setEnriching(false);
    }
  }

  function handleComplete() {
    onComplete(domain.trim());
  }

  return (
    <div>
      <div style={{ marginBottom: "var(--space-5)" }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          First Enrichment
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
          Paste a target company domain and watch Harvest find contacts. This is how you will build prospect lists.
        </p>
      </div>

      {error && (
        <div style={{
          padding: "var(--space-3)",
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--error-subtle, #fef2f2)",
          color: "var(--error, #dc2626)",
          fontSize: 13,
          marginBottom: "var(--space-4)",
        }}>
          {error}
        </div>
      )}

      {/* Domain input */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <label style={{
          display: "block",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--text-secondary)",
          marginBottom: 6,
        }}>
          Company Domain
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="acme.com"
            disabled={enriching}
            onKeyDown={(e) => {
              if (e.key === "Enter" && domain.trim() && !enriching) handleEnrich();
            }}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
              backgroundColor: "var(--surface-base)",
              color: "var(--text-primary)",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={handleEnrich}
            disabled={!domain.trim() || enriching}
            style={{
              padding: "8px 20px",
              borderRadius: "var(--radius-md)",
              border: "none",
              backgroundColor: domain.trim() && !enriching ? "var(--harvest-green)" : "var(--border-default)",
              color: domain.trim() && !enriching ? "#fff" : "var(--text-tertiary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: domain.trim() && !enriching ? "pointer" : "not-allowed",
              transition: "all 0.2s",
              whiteSpace: "nowrap",
            }}
          >
            {enriching ? "Enriching..." : "Enrich"}
          </button>
        </div>
        {enriching && (
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>
            Searching for company data and contacts...
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div style={{
          padding: "var(--space-4)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--harvest-green)",
          backgroundColor: "var(--harvest-green-subtle)",
          marginBottom: "var(--space-4)",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: "var(--space-3)",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--harvest-green)",
          }}>
            <span>&#10003;</span>
            Enrichment Complete
          </div>

          {result.company && (
            <div style={{ marginBottom: "var(--space-3)" }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
                {result.company.name}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", gap: 12, marginTop: 2 }}>
                {result.company.industry && <span>{result.company.industry}</span>}
                {result.company.size && <span>{result.company.size.toLocaleString()} employees</span>}
              </div>
            </div>
          )}

          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginBottom: result.contacts.length > 0 ? "var(--space-3)" : 0,
          }}>
            <div style={{
              padding: "var(--space-3)",
              borderRadius: "var(--radius-sm, 4px)",
              backgroundColor: "var(--surface-base)",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>
                {result.contacts_found}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                Contacts Found
              </div>
            </div>
            <div style={{
              padding: "var(--space-3)",
              borderRadius: "var(--radius-sm, 4px)",
              backgroundColor: "var(--surface-base)",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>
                {result.contacts_saved}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                Saved
              </div>
            </div>
          </div>

          {result.contacts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {result.contacts.slice(0, 5).map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "var(--radius-sm, 4px)",
                    backgroundColor: "var(--surface-base)",
                    fontSize: 12,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{c.name}</span>
                  <span style={{ color: "var(--text-tertiary)" }}>{c.email}</span>
                </div>
              ))}
              {result.contacts.length > 5 && (
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", marginTop: 4 }}>
                  +{result.contacts.length - 5} more
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Complete button */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        {!result && (
          <button
            onClick={() => onComplete("")}
            disabled={submitting || enriching}
            style={{
              padding: "10px 24px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
              backgroundColor: "transparent",
              color: "var(--text-tertiary)",
              fontSize: 14,
              fontWeight: 500,
              cursor: submitting || enriching ? "not-allowed" : "pointer",
            }}
          >
            Skip
          </button>
        )}
        {result && (
          <button
            onClick={handleComplete}
            disabled={submitting}
            style={{
              padding: "10px 24px",
              borderRadius: "var(--radius-md)",
              border: "none",
              backgroundColor: "var(--harvest-green)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Finishing..." : "Complete Setup"}
          </button>
        )}
      </div>
    </div>
  );
}
