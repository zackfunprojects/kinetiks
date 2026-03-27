"use client";

import { useState, useEffect, useCallback } from "react";
import type { HvDomain } from "@/types/infra";

interface DomainListProps {
  onAddClick: () => void;
}

export default function DomainList({ onAddClick }: DomainListProps) {
  const [domains, setDomains] = useState<HvDomain[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDomains = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hv/domains");
      if (!res.ok) throw new Error(`Failed to fetch domains: ${res.status}`);
      const json = await res.json();
      setDomains(json.data ?? []);
    } catch (err) {
      console.error("Error fetching domains:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDomains(); }, [fetchDomains]);

  if (loading) {
    return <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading...</p>;
  }

  if (domains.length === 0) {
    return (
      <div style={{
        textAlign: "center", padding: 60, color: "var(--text-secondary)",
        border: "1px dashed var(--border-subtle)", borderRadius: 12,
      }}>
        <p style={{ fontSize: 15, margin: "0 0 8px" }}>No domains yet</p>
        <p style={{ fontSize: 13, margin: 0 }}>Add a sending domain to improve deliverability.</p>
      </div>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead>
        <tr>
          {["Domain", "Health Score", "Primary", "Registrar"].map((h) => (
            <th key={h} style={{
              textAlign: "left", padding: "8px 12px", fontSize: 12, fontWeight: 600,
              color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em",
              borderBottom: "1px solid var(--border-subtle)",
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {domains.map((d) => (
          <tr
            key={d.id}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--surface-raised)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
          >
            <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500, borderBottom: "1px solid var(--border-subtle)" }}>
              {d.domain}
            </td>
            <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 60, height: 6, borderRadius: 3, backgroundColor: "var(--border-subtle)", overflow: "hidden",
                }}>
                  <div style={{
                    width: `${d.health_score}%`, height: "100%", borderRadius: 3,
                    backgroundColor: d.health_score >= 80 ? "var(--harvest-green)" : d.health_score >= 50 ? "var(--harvest-amber)" : "var(--error, #d44040)",
                  }} />
                </div>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{d.health_score}</span>
              </div>
            </td>
            <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
              {d.is_primary ? (
                <span style={{
                  display: "inline-block", padding: "2px 8px", borderRadius: 4,
                  fontSize: 12, fontWeight: 600, backgroundColor: "rgba(61,124,71,0.10)", color: "var(--harvest-green)",
                }}>
                  Primary
                </span>
              ) : (
                <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>-</span>
              )}
            </td>
            <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
              {d.registrar ?? "-"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
