/**
 * query_insights tool — Oracle's insight store, read-only.
 *
 * Marcus's step 7.5 picks this tool when the user asks variations of
 * "what changed?", "any alerts?", "how is X trending?". Returns a
 * projection of up to `limit` recent insights, filtered by severity,
 * type, source app, and recency.
 *
 * Surfacing in tool output does NOT stamp delivered=true. Only the
 * brief reader stamps when Sonnet's response cites the insight_id
 * (Slice 11 — engine integration).
 */

import "server-only";

import { z } from "zod";
import { defineTool } from "@kinetiks/tools";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadInsightsForTool } from "@/lib/oracle/insights/reader";

const Input = z.object({
  severity_floor: z.enum(["info", "notable", "urgent"]).default("info"),
  types: z
    .array(
      z.enum([
        "anomaly",
        "trend",
        "correlation",
        "opportunity",
        "risk",
        "recommendation",
        "identity_update",
        "approval_outcome",
        "authority_change",
        "pattern_update",
      ])
    )
    .optional(),
  source_apps: z.array(z.string()).optional(),
  since_hours: z.number().int().min(1).max(168).default(72),
  include_delivered: z.boolean().default(false),
  limit: z.number().int().min(1).max(10).default(5),
});

const ProjectedRow = z.object({
  id: z.string().uuid(),
  type: z.string(),
  severity: z.enum(["info", "notable", "urgent"]),
  summary: z.string(),
  source_app: z.string(),
  created_at: z.string(),
  evidence_highlights: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .max(4),
  suggested_action: z
    .object({ kind: z.string(), label: z.string() })
    .nullable(),
});

const Output = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    insights: z.array(ProjectedRow).max(10),
    cap_reached: z.boolean(),
  }),
  z.object({
    status: z.literal("no_insights"),
    message: z.string(),
  }),
  z.object({
    status: z.literal("error"),
    error_class: z.enum(["query_failed", "internal"]),
    message: z.string(),
  }),
]);

export const queryInsightsTool = defineTool({
  name: "query_insights",
  description:
    "Read the Oracle insight store. Returns up to 5 of the most recent account-scoped insights filtered by severity, type, source app, and time window. Use this whenever the user asks 'what changed', 'any alerts', 'how is my traffic trending', 'what's going on with X', or otherwise wants an overview of system observations. Returns a discriminated union: {status:'ok', insights[], cap_reached} when insights exist, {status:'no_insights', message} on empty filter, {status:'error', ...} on failure. The output is a PROJECTION (summary, severity, type, evidence_highlights ≤4, suggested_action) — never the raw row. Read-only; never schedules an action. Surface findings to the user verbatim; do not invent insight content the tool did not return. Available source_app values: ga4, gsc, stripe, meta_ads, google_ads, hubspot, cross.",
  inputSchema: Input,
  outputSchema: Output,
  isConsequential: false,
  autoApproveThreshold: null,
  availability: { kind: "always" },
  execute: async (input, ctx) => {
    const admin = createAdminClient();
    try {
      const projections = await loadInsightsForTool({
        admin,
        accountId: ctx.accountId,
        severityFloor: input.severity_floor,
        types: input.types,
        sourceApps: input.source_apps,
        sinceHours: input.since_hours,
        includeDelivered: input.include_delivered,
        limit: input.limit,
      });

      if (projections.length === 0) {
        return {
          status: "no_insights" as const,
          message:
            "No insights matched the given filters. Either nothing notable has happened recently, or the connected data sources have not surfaced anything yet.",
        };
      }

      return {
        status: "ok" as const,
        insights: projections.map((p) => ({
          id: p.insight_id,
          type: p.type,
          severity: p.severity,
          summary: p.summary,
          source_app: p.source_app,
          created_at: p.created_at,
          evidence_highlights: p.evidence_highlights,
          suggested_action: p.suggested_action,
        })),
        cap_reached: projections.length === input.limit,
      };
    } catch (err) {
      return {
        status: "error" as const,
        error_class: "query_failed" as const,
        message: err instanceof Error ? err.message : "unknown",
      };
    }
  },
});
