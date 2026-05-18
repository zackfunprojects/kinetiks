/**
 * Insight projection helpers.
 *
 * The brief reader + query_insights tool need a smaller, PII-safe view
 * over kinetiks_insights rows. The projector enforces:
 *   - Defensive strip of any contact_*, email_*, phone_*, address_*,
 *     token_*, auth_* keys (the writer rejects them, but defense in depth).
 *   - Evidence highlights capped at 4 key/value pairs.
 *   - Values stringified for display.
 */

import type { InsightProjection, SignalSeverity } from "./types";

interface RawInsightRow {
  id: string;
  type: string;
  severity: string;
  source_app: string;
  summary: string;
  evidence: Record<string, unknown> | null;
  suggested_action: Record<string, unknown> | null;
  created_at: string;
}

const FORBIDDEN_KEY = /^(contact_|email_|phone_|address_|token_|auth_|password|ssn|dob)/i;
const MAX_EVIDENCE_HIGHLIGHTS = 4;

function isAllowedKey(key: string): boolean {
  return !FORBIDDEN_KEY.test(key);
}

function asString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") {
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  }
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export function projectInsight(row: RawInsightRow): InsightProjection {
  const evidenceHighlights: Array<{ label: string; value: string }> = [];
  if (row.evidence && typeof row.evidence === "object") {
    for (const [key, value] of Object.entries(row.evidence)) {
      if (!isAllowedKey(key)) continue;
      evidenceHighlights.push({ label: key, value: asString(value) });
      if (evidenceHighlights.length >= MAX_EVIDENCE_HIGHLIGHTS) break;
    }
  }

  const suggestedAction =
    row.suggested_action && typeof row.suggested_action === "object"
      ? {
          kind: asString(row.suggested_action.kind ?? "open_thread"),
          label: asString(row.suggested_action.label ?? ""),
        }
      : null;

  return {
    insight_id: row.id,
    type: row.type,
    severity: row.severity as SignalSeverity,
    source_app: row.source_app,
    summary: row.summary,
    evidence_highlights: evidenceHighlights,
    suggested_action: suggestedAction,
    created_at: row.created_at,
  };
}
