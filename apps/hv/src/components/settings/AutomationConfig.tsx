"use client";

import { useState, useEffect, useCallback } from "react";
import type { HvConfidenceRow } from "@/types/settings";
import GrowthMeter from "@/components/shared/GrowthMeter";
import TrustMeter from "@/components/shared/TrustMeter";
import ModeIndicator from "@/components/shared/ModeIndicator";

/* ── Types ─────────────────────────────────────────────────── */

type AutomationMode = "human" | "assisted" | "autopilot";

/* ── Helpers ───────────────────────────────────────────────── */

function toMode(raw: string): AutomationMode {
  if (raw === "assisted" || raw === "approvals") return "assisted";
  if (raw === "autopilot") return "autopilot";
  return "human";
}

function computeAggregateLevel(operators: HvConfidenceRow[]): number {
  if (operators.length === 0) return 0;
  const modeScores: Record<AutomationMode, number> = { human: 0, assisted: 50, autopilot: 100 };
  const total = operators.reduce((sum, op) => sum + modeScores[toMode(op.mode)], 0);
  return Math.round(total / operators.length);
}

function computeAggregateMode(operators: HvConfidenceRow[]): AutomationMode {
  const level = computeAggregateLevel(operators);
  if (level >= 75) return "autopilot";
  if (level >= 25) return "assisted";
  return "human";
}

/* ── Component ─────────────────────────────────────────────── */

export default function AutomationConfig() {
  const [operators, setOperators] = useState<HvConfidenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const fetchOperators = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hv/automations");
      if (!res.ok) throw new Error(`Failed to fetch automations: ${res.status}`);
      const json = await res.json();
      setOperators(json.data ?? []);
    } catch (err) {
      console.error("Error fetching automations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOperators();
  }, [fetchOperators]);

  function toggleOverride(operatorId: string) {
    setOverrides((prev) => ({ ...prev, [operatorId]: !prev[operatorId] }));
  }

  if (loading) {
    return <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading growth data...</p>;
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
        <p style={{ fontSize: 15, margin: "0 0 8px" }}>No growth data yet</p>
        <p style={{ fontSize: 13, margin: 0 }}>
          As you use Harvest and make decisions, the system learns your preferences and features
          graduate from Human to Assisted to Autopilot.
        </p>
      </div>
    );
  }

  const aggregateLevel = computeAggregateLevel(operators);
  const aggregateMode = computeAggregateMode(operators);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Overall Growth Meter */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "24px 0 16px",
          borderRadius: "var(--radius-lg, 12px)",
          backgroundColor: "var(--harvest-green-subtle, rgba(61,124,71,0.05))",
          border: "1px solid var(--border-subtle, #eee)",
        }}
      >
        <GrowthMeter level={aggregateLevel} mode={aggregateMode} />
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary, #666)",
            margin: "12px 0 0",
            textAlign: "center",
            maxWidth: 360,
            lineHeight: 1.5,
          }}
        >
          Your aggregate automation level across all Harvest features.
          Features graduate as you approve AI suggestions consistently.
        </p>
      </div>

      {/* Per-operator trust meters */}
      <div>
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary, #111)",
            margin: "0 0 14px",
          }}
        >
          Per-feature trust
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {operators.map((op) => {
            const mode = toMode(op.mode);
            const isOverridden = overrides[op.id] === true;
            const effectiveMode: AutomationMode = isOverridden ? "human" : mode;

            return (
              <div
                key={op.id}
                style={{
                  padding: "14px 16px",
                  borderRadius: "var(--radius-md, 8px)",
                  border: "1px solid var(--border-subtle, #eee)",
                  backgroundColor: isOverridden
                    ? "var(--mode-human-muted, rgba(107,104,96,0.05))"
                    : "var(--surface-base, #fff)",
                  transition: `all var(--duration-normal, 250ms) ease`,
                }}
              >
                {/* Row header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--text-primary, #111)",
                      }}
                    >
                      {op.function_name}
                    </span>
                    <ModeIndicator mode={effectiveMode} size="sm" />
                    {isOverridden && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--text-tertiary, #888)",
                          fontStyle: "italic",
                        }}
                      >
                        (forced human)
                      </span>
                    )}
                  </div>

                  {/* Override toggle */}
                  {mode !== "human" && (
                    <button
                      onClick={() => toggleOverride(op.id)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--border-subtle, #ddd)",
                        backgroundColor: isOverridden
                          ? "var(--mode-human-muted, rgba(107,104,96,0.10))"
                          : "transparent",
                        color: "var(--text-secondary, #666)",
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: "pointer",
                        fontFamily: "var(--font-sans)",
                        transition: `all var(--duration-normal, 250ms) ease`,
                      }}
                    >
                      {isOverridden ? "Restore auto" : "Force human"}
                    </button>
                  )}
                </div>

                {/* Trust meter */}
                <TrustMeter
                  agreementRate={op.agreement_rate / 100}
                  totalDecisions={op.total_decisions}
                  currentMode={effectiveMode}
                  assistedThreshold={op.min_decisions_for_approvals}
                  autopilotThreshold={op.min_decisions_for_autopilot}
                  autopilotAgreement={op.min_agreement_for_autopilot / 100}
                />

                {/* Stats row */}
                <div
                  style={{
                    display: "flex",
                    gap: 20,
                    marginTop: 8,
                    fontSize: 12,
                    color: "var(--text-tertiary, #888)",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  <span>{op.total_decisions} decisions</span>
                  <span>{op.agreement_rate}% agreement</span>
                  <span>
                    {op.outcomes_positive}W / {op.outcomes_negative}L
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Explanation */}
      <div
        style={{
          padding: "16px 18px",
          borderRadius: "var(--radius-md, 8px)",
          backgroundColor: "var(--surface-raised, #f9f9f9)",
          border: "1px solid var(--border-subtle, #eee)",
        }}
      >
        <h4
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-primary, #111)",
            margin: "0 0 8px",
          }}
        >
          How trust grows
        </h4>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-secondary, #666)",
            lineHeight: 1.6,
          }}
        >
          <p style={{ margin: "0 0 8px" }}>
            Every feature starts in <strong>Human</strong> mode - you make all decisions.
            As you approve AI suggestions, the system builds trust.
          </p>
          <p style={{ margin: "0 0 8px" }}>
            After enough consistent decisions, a feature graduates to <strong>Assisted</strong> mode.
            The AI drafts suggestions that you review before they go out.
          </p>
          <p style={{ margin: 0 }}>
            When your agreement rate is high enough over many decisions, a feature
            can reach <strong>Autopilot</strong> - the AI acts independently with
            periodic review. You can always force any feature back to Human mode.
          </p>
        </div>
      </div>
    </div>
  );
}
