/**
 * Oracle signal types — the canonical shape detectors emit.
 *
 * Signals are pre-insights. The Oracle runner takes a SignalArray,
 * dedups against `kinetiks_insights`, optionally polishes summary +
 * suggested_action via Haiku, then writes the survivors to the insight
 * store via the writer.
 *
 * Per CLAUDE.md: signal evidence is restricted to a key allowlist
 * (numerics + dimension strings only — never raw PII). The writer's
 * Zod schema enforces this at write time.
 */

import type { z } from "zod";

export type SignalSeverity = "info" | "notable" | "urgent";

/**
 * Maps to kinetiks_insights.type enum. Detectors only emit a subset
 * (anomaly, trend, correlation, opportunity, risk). The remaining enum
 * values are reserved for non-Oracle writers.
 */
export type SignalType = "anomaly" | "trend" | "correlation" | "opportunity" | "risk";

/**
 * Suggested action — the data needed for the "Apply" button on an
 * Analytics insight card. `kind` describes what happens on Apply:
 *   - 'apply_proposal'   → a Synapse Proposal is filed in Cortex
 *   - 'open_thread'      → opens a Marcus thread pre-seeded with the insight
 *   - 'tweak_budget'     → routes to the Budget approval flow
 *   - null               → read-only, no Apply button
 *
 * For D2 the customer-facing Apply always opens a thread (per the
 * approved plan, user decision 3). Other kinds reserve future shapes.
 */
export interface SignalSuggestedAction {
  kind: "apply_proposal" | "open_thread" | "tweak_budget" | null;
  label: string;
  payload?: Record<string, number | string | boolean | string[]>;
}

interface BaseSignal {
  type: SignalType;
  severity: SignalSeverity;
  source_app: string;             // 'ga4' | 'gsc' | 'stripe' | 'meta_ads' | 'google_ads' | 'hubspot' | 'cross'
  source_operator: string;        // e.g. 'oracle.analyzer.drill', 'oracle.analyzer.roas-channel'
  summary: string;                // ≤140 chars; deterministic fallback before Haiku polish
  evidence: Record<string, number | string | boolean | string[]>;
  suggested_action: SignalSuggestedAction | null;
  /**
   * Stable 24h dedup key. Format depends on detector:
   *   per-source:    `{detector}:{metric}:{dim}:{dim_value}:{iso_week}`
   *   cross-source:  `{detector}:{sortedSources}:{iso_week}`
   */
  dedup_key: string;
}

// Discriminated subtypes — extension point if a detector needs to carry
// extra structured fields beyond the BaseSignal envelope.
export interface AnomalySignal extends BaseSignal {
  type: "anomaly";
}

export interface TrendSignal extends BaseSignal {
  type: "trend";
}

export interface CorrelationSignal extends BaseSignal {
  type: "correlation";
}

export interface OpportunitySignal extends BaseSignal {
  type: "opportunity";
}

export interface RiskSignal extends BaseSignal {
  type: "risk";
}

export type OracleSignal =
  | AnomalySignal
  | TrendSignal
  | CorrelationSignal
  | OpportunitySignal
  | RiskSignal;

/**
 * Projection emitted by the insight reader for the Marcus brief.
 * Smaller than the full row; references the id so Sonnet can cite it.
 */
export interface InsightProjection {
  insight_id: string;
  type: string;
  severity: SignalSeverity;
  source_app: string;
  summary: string;
  evidence_highlights: Array<{ label: string; value: string }>;
  suggested_action: { kind: string; label: string } | null;
  created_at: string;
}

/**
 * Compute the ISO-week id for a date (e.g. "2026-W20"). Used by every
 * detector's dedup key to keep "this week's emerging trend" stable as
 * the Oracle runs multiple times within the week.
 */
export function isoWeek(date: Date): string {
  // Algorithm: ISO 8601 week-of-year. Source: well-known formula.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// ─── Re-export Zod for downstream writers/projectors ────────
export type { z };
