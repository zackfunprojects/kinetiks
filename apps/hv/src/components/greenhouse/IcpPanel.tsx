"use client";

import { useState, useEffect } from "react";

interface Persona {
  name: string;
  role: string | null;
  company_type: string | null;
  pain_points: string[];
}

interface FitDistribution {
  high: number;   // 80+
  medium: number;  // 60-79
  low: number;     // 40-59
  poor: number;    // <40
  total: number;
}

export default function IcpPanel() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [distribution, setDistribution] = useState<FitDistribution | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadIcpData() {
      try {
        // Fetch ICP personas from Kinetiks ID via Synapse
        const [icpRes, distRes] = await Promise.all([
          fetch("/api/hv/icp"),
          fetch("/api/hv/contacts/filters"),
        ]);

        if (icpRes.ok) {
          const icpJson = await icpRes.json();
          setPersonas(icpJson.data?.personas ?? []);
        }

        if (distRes.ok) {
          const distJson = await distRes.json();
          // Calculate fit distribution from contact scores
          const scores: number[] = distJson.data?.score_distribution ?? [];
          if (scores.length > 0) {
            setDistribution({
              high: scores.filter((s: number) => s >= 80).length,
              medium: scores.filter((s: number) => s >= 60 && s < 80).length,
              low: scores.filter((s: number) => s >= 40 && s < 60).length,
              poor: scores.filter((s: number) => s < 40).length,
              total: scores.length,
            });
          }
        }
      } catch (err) {
        console.error("Failed to load ICP data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadIcpData();
  }, []);

  if (loading) {
    return (
      <div style={{
        padding: "var(--space-5)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-default)",
        backgroundColor: "var(--surface-elevated)",
      }}>
        <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Loading ICP...</div>
      </div>
    );
  }

  return (
    <div style={{
      padding: "var(--space-5)",
      borderRadius: "var(--radius-lg)",
      border: "1px solid var(--border-default)",
      backgroundColor: "var(--surface-elevated)",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: "var(--space-4)",
      }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Ideal Customer Profile
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "2px 0 0" }}>
            {personas.length > 0
              ? `${personas.length} persona${personas.length !== 1 ? "s" : ""} defined`
              : "No personas defined yet"}
          </p>
        </div>
        <a
          href="https://id.kinetiks.ai/context/customers"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 12, fontWeight: 500, color: "var(--harvest-green)",
            textDecoration: "none",
          }}
        >
          Edit in Kinetiks ID
        </a>
      </div>

      {/* Persona cards */}
      {personas.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {personas.slice(0, 3).map((p, i) => (
            <div
              key={i}
              style={{
                padding: "var(--space-3)",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--surface-raised)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{
                fontSize: 13, fontWeight: 500, color: "var(--text-primary)",
                marginBottom: 2,
              }}>
                {p.name || p.role || "Unnamed Persona"}
              </div>
              {p.role && p.name !== p.role && (
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {p.role}{p.company_type ? ` at ${p.company_type}` : ""}
                </div>
              )}
              {p.pain_points && p.pain_points.length > 0 && (
                <div style={{
                  fontSize: 11, color: "var(--text-tertiary)", marginTop: 4,
                  display: "flex", gap: 4, flexWrap: "wrap",
                }}>
                  {p.pain_points.slice(0, 3).map((pp, j) => (
                    <span
                      key={j}
                      style={{
                        padding: "1px 6px",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "var(--harvest-green-subtle)",
                        color: "var(--harvest-green)",
                        fontSize: 11,
                      }}
                    >
                      {pp}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          padding: "var(--space-5)",
          textAlign: "center",
          color: "var(--text-tertiary)",
          fontSize: 13,
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--surface-raised)",
          border: "1px dashed var(--border-default)",
        }}>
          <p style={{ margin: "0 0 8px" }}>No ICP personas defined</p>
          <a
            href="https://id.kinetiks.ai/context/customers"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12, fontWeight: 500, color: "var(--harvest-green)",
              textDecoration: "none",
            }}
          >
            Define your ICP in Kinetiks ID
          </a>
        </div>
      )}

      {/* Fit distribution bar */}
      {distribution && distribution.total > 0 && (
        <div style={{ marginTop: "var(--space-4)" }}>
          <div style={{
            fontSize: 12, fontWeight: 500, color: "var(--text-secondary)",
            marginBottom: "var(--space-2)",
          }}>
            ICP Fit Distribution ({distribution.total} contacts)
          </div>
          <div style={{
            display: "flex", height: 8, borderRadius: 4, overflow: "hidden",
            backgroundColor: "var(--surface-raised)",
          }}>
            {distribution.high > 0 && (
              <div style={{
                width: `${(distribution.high / distribution.total) * 100}%`,
                backgroundColor: "var(--harvest-green)",
                transition: "width 0.3s ease",
              }}
                title={`High fit: ${distribution.high}`}
              />
            )}
            {distribution.medium > 0 && (
              <div style={{
                width: `${(distribution.medium / distribution.total) * 100}%`,
                backgroundColor: "var(--harvest-amber)",
                transition: "width 0.3s ease",
              }}
                title={`Medium fit: ${distribution.medium}`}
              />
            )}
            {distribution.low > 0 && (
              <div style={{
                width: `${(distribution.low / distribution.total) * 100}%`,
                backgroundColor: "var(--harvest-soil)",
                transition: "width 0.3s ease",
              }}
                title={`Low fit: ${distribution.low}`}
              />
            )}
            {distribution.poor > 0 && (
              <div style={{
                width: `${(distribution.poor / distribution.total) * 100}%`,
                backgroundColor: "var(--border-strong)",
                transition: "width 0.3s ease",
              }}
                title={`Poor fit: ${distribution.poor}`}
              />
            )}
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 11, color: "var(--text-tertiary)", marginTop: 4,
          }}>
            <span style={{ color: "var(--harvest-green)" }}>{distribution.high} high</span>
            <span style={{ color: "var(--harvest-amber)" }}>{distribution.medium} medium</span>
            <span style={{ color: "var(--harvest-soil)" }}>{distribution.low} low</span>
            <span>{distribution.poor} poor</span>
          </div>
        </div>
      )}
    </div>
  );
}
