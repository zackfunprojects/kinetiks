"use client";

import { useState, useEffect, useCallback } from "react";
import type { HvConfidenceRow } from "@/types/settings";

const MODE_COLORS: Record<string, { bg: string; fg: string }> = {
  human: { bg: "rgba(155,155,167,0.12)", fg: "var(--text-secondary)" },
  approvals: { bg: "rgba(253,203,110,0.12)", fg: "#FDCB6E" },
  autopilot: { bg: "rgba(0,206,201,0.12)", fg: "#00CEC9" },
};

export default function AutomationConfig() {
  const [operators, setOperators] = useState<HvConfidenceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOperators = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/hv/automations");
    const json = await res.json();
    setOperators(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOperators();
  }, [fetchOperators]);

  if (loading) {
    return <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading...</p>;
  }

  if (operators.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: 60,
          color: "var(--text-secondary)",
          border: "1px dashed var(--border-subtle)",
          borderRadius: 12,
        }}
      >
        <p style={{ fontSize: 15, margin: "0 0 8px" }}>No automation data</p>
        <p style={{ fontSize: 13, margin: 0 }}>
          Operator confidence data will appear here as you use Harvest and make decisions.
        </p>
      </div>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead>
        <tr>
          {["Operator", "Function", "Mode", "Agreement Rate", "Total Decisions"].map((h) => (
            <th
              key={h}
              style={{
                textAlign: "left",
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {operators.map((op) => {
          const modeColor = MODE_COLORS[op.mode] ?? MODE_COLORS.human;
          return (
            <tr
              key={op.id}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "var(--surface-raised)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
              }}
            >
              <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500, borderBottom: "1px solid var(--border-subtle)" }}>
                {op.operator}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                {op.function_name}
              </td>
              <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    backgroundColor: modeColor.bg,
                    color: modeColor.fg,
                  }}
                >
                  {op.mode}
                </span>
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500, borderBottom: "1px solid var(--border-subtle)" }}>
                {op.agreement_rate}%
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                {op.total_decisions}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
