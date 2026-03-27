"use client";

import { useState, useEffect } from "react";

interface Persona {
  name: string;
  role: string | null;
  company_type: string | null;
  pain_points: string[];
  buying_triggers: string[];
  objections: string[];
  conversion_signals: string[];
}

interface IcpReviewStepProps {
  submitting: boolean;
  onComplete: () => void;
}

export default function IcpReviewStep({ submitting, onComplete }: IcpReviewStepProps) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/hv/icp");
        if (!res.ok) {
          setError("Failed to load ICP data");
          return;
        }
        const json = await res.json();
        if (json.data?.personas) {
          setPersonas(json.data.personas as Persona[]);
        }
      } catch (err) {
        console.error("Failed to load ICP:", err);
        setError("Failed to load ICP data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ color: "var(--text-tertiary)", fontSize: 13, padding: 20, textAlign: "center" }}>
        Loading your ICP from Kinetiks ID...
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: "var(--space-5)" }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          Review Your ICP
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
          These personas come from your Kinetiks ID. Harvest uses them to score contacts and personalize outreach.
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

      {personas.length === 0 ? (
        <div style={{
          padding: "var(--space-6)",
          borderRadius: "var(--radius-md)",
          border: "1px dashed var(--border-default)",
          textAlign: "center",
          marginBottom: "var(--space-4)",
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>👤</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 4 }}>
            No personas found
          </div>
          <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 12 }}>
            Your Kinetiks ID doesn't have ICP personas yet. You can add them later or continue without.
          </div>
          <a
            href="https://id.kinetiks.ai/context/customers"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 13,
              color: "var(--harvest-green)",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Add personas in Kinetiks ID →
          </a>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
          {personas.map((persona, i) => (
            <div
              key={i}
              style={{
                padding: "var(--space-4)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)",
                backgroundColor: "var(--surface-base)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                  {persona.name}
                </div>
                {persona.role && (
                  <div style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--harvest-green)",
                    backgroundColor: "var(--harvest-green-subtle)",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-sm, 4px)",
                  }}>
                    {persona.role}
                  </div>
                )}
              </div>

              {persona.company_type && (
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>
                  {persona.company_type}
                </div>
              )}

              {persona.pain_points.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                    Pain Points
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {persona.pain_points.map((pp, j) => (
                      <span
                        key={j}
                        style={{
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          backgroundColor: "var(--surface-elevated)",
                          padding: "2px 8px",
                          borderRadius: "var(--radius-sm, 4px)",
                          border: "1px solid var(--border-subtle, var(--border-default))",
                        }}
                      >
                        {pp}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {persona.buying_triggers.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                    Buying Triggers
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {persona.buying_triggers.map((bt, j) => (
                      <span
                        key={j}
                        style={{
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          backgroundColor: "var(--surface-elevated)",
                          padding: "2px 8px",
                          borderRadius: "var(--radius-sm, 4px)",
                          border: "1px solid var(--border-subtle, var(--border-default))",
                        }}
                      >
                        {bt}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {personas.length > 0 && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <a
            href="https://id.kinetiks.ai/context/customers"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 13,
              color: "var(--text-tertiary)",
              textDecoration: "none",
            }}
          >
            Edit personas in Kinetiks ID →
          </a>
        </div>
      )}

      {/* Continue button */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={onComplete}
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
          {submitting ? "Saving..." : personas.length > 0 ? "Looks Good" : "Continue Without"}
        </button>
      </div>
    </div>
  );
}
