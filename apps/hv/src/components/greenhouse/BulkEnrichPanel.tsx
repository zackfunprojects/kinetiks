"use client";

import { useState } from "react";

interface EnrichResult {
  domain: string;
  status: "success" | "error" | "pending";
  contactsFound?: number;
  orgName?: string;
  error?: string;
}

export default function BulkEnrichPanel() {
  const [domains, setDomains] = useState("");
  const [results, setResults] = useState<EnrichResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);

  async function handleEnrich() {
    const domainList = domains
      .split("\n")
      .map((d) => d.trim())
      .filter((d) => d.length > 0 && d.includes("."));

    if (domainList.length === 0) return;

    setProcessing(true);
    setResults(domainList.map((d) => ({ domain: d, status: "pending" })));

    for (let i = 0; i < domainList.length; i++) {
      setCurrentIndex(i);

      try {
        const res = await fetch("/api/hv/scout/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: domainList[i] }),
        });

        const json = await res.json();

        if (res.ok && json.success) {
          setResults((prev) =>
            prev.map((r, j) =>
              j === i
                ? {
                    ...r,
                    status: "success",
                    contactsFound: json.data?.contacts_saved ?? 0,
                    orgName: json.data?.company?.name ?? domainList[i],
                  }
                : r
            )
          );
        } else {
          setResults((prev) =>
            prev.map((r, j) =>
              j === i ? { ...r, status: "error", error: json.error ?? "Failed" } : r
            )
          );
        }
      } catch (err) {
        setResults((prev) =>
          prev.map((r, j) =>
            j === i
              ? { ...r, status: "error", error: err instanceof Error ? err.message : "Network error" }
              : r
          )
        );
      }
    }

    setProcessing(false);
    setCurrentIndex(-1);
  }

  const completedCount = results.filter((r) => r.status !== "pending").length;
  const totalContacts = results
    .filter((r) => r.status === "success")
    .reduce((sum, r) => sum + (r.contactsFound ?? 0), 0);

  return (
    <div style={{
      padding: "var(--space-5)",
      borderRadius: "var(--radius-lg)",
      border: "1px solid var(--border-default)",
      backgroundColor: "var(--surface-elevated)",
      display: "flex",
      flexDirection: "column",
    }}>
      <h3 style={{
        fontSize: 14, fontWeight: 600, color: "var(--text-primary)",
        margin: "0 0 var(--space-1)",
      }}>
        Enrich Domains
      </h3>
      <p style={{
        fontSize: 12, color: "var(--text-tertiary)",
        margin: "0 0 var(--space-3)",
      }}>
        Paste company domains to find contacts and enrich with PDL data.
      </p>

      <textarea
        value={domains}
        onChange={(e) => setDomains(e.target.value)}
        placeholder={"acme.com\nexample.io\nstartup.co"}
        rows={4}
        disabled={processing}
        style={{
          width: "100%",
          padding: "var(--space-3)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-default)",
          backgroundColor: "var(--surface-base)",
          color: "var(--text-primary)",
          fontSize: 13,
          fontFamily: "var(--font-mono, monospace)",
          resize: "vertical",
          outline: "none",
          boxSizing: "border-box",
          lineHeight: 1.6,
        }}
      />

      <button
        onClick={handleEnrich}
        disabled={processing || domains.trim().length === 0}
        style={{
          marginTop: "var(--space-3)",
          padding: "8px 16px",
          borderRadius: "var(--radius-md)",
          border: "none",
          backgroundColor: processing ? "var(--surface-raised)" : "var(--harvest-green)",
          color: processing ? "var(--text-tertiary)" : "#fff",
          fontSize: 13,
          fontWeight: 600,
          cursor: processing ? "not-allowed" : "pointer",
          transition: "all var(--duration-fast) var(--ease-smooth)",
        }}
      >
        {processing
          ? `Enriching ${completedCount + 1} of ${results.length}...`
          : "Enrich Domains"}
      </button>

      {/* Results */}
      {results.length > 0 && (
        <div style={{
          marginTop: "var(--space-3)",
          maxHeight: 160,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}>
          {results.map((r, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 8px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--surface-raised)",
                fontSize: 12,
              }}
            >
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                color: "var(--text-primary)",
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  backgroundColor:
                    r.status === "success" ? "var(--harvest-green)"
                    : r.status === "error" ? "var(--error)"
                    : i === currentIndex ? "var(--harvest-amber)"
                    : "var(--border-strong)",
                  flexShrink: 0,
                }} />
                <span style={{ fontFamily: "var(--font-mono, monospace)" }}>
                  {r.domain}
                </span>
              </div>
              <span style={{
                fontSize: 11,
                color: r.status === "success" ? "var(--harvest-green)"
                  : r.status === "error" ? "var(--error)"
                  : "var(--text-tertiary)",
              }}>
                {r.status === "success" && `${r.contactsFound} contacts`}
                {r.status === "error" && (r.error ?? "Failed")}
                {r.status === "pending" && (i === currentIndex ? "Enriching..." : "Queued")}
              </span>
            </div>
          ))}

          {/* Summary */}
          {!processing && completedCount === results.length && totalContacts > 0 && (
            <div style={{
              padding: "8px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--harvest-green-subtle)",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--harvest-green)",
              textAlign: "center",
              marginTop: 4,
            }}>
              {totalContacts} contacts added from {results.filter((r) => r.status === "success").length} domains
            </div>
          )}
        </div>
      )}
    </div>
  );
}
