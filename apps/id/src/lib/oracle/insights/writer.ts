/**
 * Oracle insight writer.
 *
 * The ONLY legitimate writer to kinetiks_insights from Oracle code.
 * Enforces:
 *   1. PII guard via Zod — evidence keys + value shapes are allowlisted.
 *   2. Source operator stamped as 'oracle.analyzer' (NOT the per-detector
 *      sub-operator) so the dedup query has a stable filter.
 *   3. Batched insert. One database round-trip per writeInsights() call.
 *   4. team_scope_id is null (v1 forward-compat).
 *
 * The runner is responsible for dedup BEFORE calling the writer — see
 * `dedup.ts`. The writer doesn't repeat the dedup query.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { OracleSignal } from "./types";
import { closeMostRecentConnectionEvidenceForProvider } from "@/lib/patterns/emit-internal";

// PII guard: evidence keys are restricted to a known-safe set + a regex
// fallback for legitimate dimension/metric names. NEVER allow contact_*,
// email_*, phone_*, address_*, token_* etc.
const FORBIDDEN_KEY = /^(contact_|email_|phone_|address_|token_|auth_|password|ssn|dob)/i;

const evidenceValueSchema = z.union([
  z.number().finite(),
  z.string(),
  z.boolean(),
  z.array(z.string()),
]);

const evidenceSchema = z
  .record(evidenceValueSchema)
  .refine(
    (rec) => Object.keys(rec).every((k) => !FORBIDDEN_KEY.test(k)),
    {
      message:
        "evidence contains a forbidden PII-shaped key (contact_*, email_*, phone_*, address_*, token_*, auth_*, password, ssn, dob)",
    }
  );

const signalSchema = z.object({
  type: z.enum(["anomaly", "trend", "correlation", "opportunity", "risk"]),
  severity: z.enum(["info", "notable", "urgent"]),
  source_app: z.string().min(1).max(64),
  source_operator: z.string().min(1).max(128),
  summary: z.string().min(1).max(500),
  evidence: evidenceSchema,
  suggested_action: z
    .object({
      kind: z.enum(["apply_proposal", "open_thread", "tweak_budget"]).nullable(),
      label: z.string().min(1).max(200),
      payload: z.record(evidenceValueSchema).optional(),
    })
    .nullable(),
  dedup_key: z.string().min(1).max(256),
});

export interface WriteInsightsInput {
  accountId: string;
  signals: OracleSignal[];
}

export interface WriteInsightsResult {
  written: number;
  /** Per-signal violations (dropped, not thrown). */
  rejected: Array<{ dedup_key: string; reason: string }>;
}

export async function writeInsights(
  admin: SupabaseClient,
  input: WriteInsightsInput
): Promise<WriteInsightsResult> {
  if (input.signals.length === 0) {
    return { written: 0, rejected: [] };
  }

  const rejected: WriteInsightsResult["rejected"] = [];
  const rows: Array<Record<string, unknown>> = [];

  for (const signal of input.signals) {
    const parsed = signalSchema.safeParse(signal);
    if (!parsed.success) {
      rejected.push({
        dedup_key: signal.dedup_key,
        reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
      continue;
    }
    rows.push({
      account_id: input.accountId,
      team_scope_id: null,
      type: parsed.data.type,
      severity: parsed.data.severity,
      summary: parsed.data.summary,
      evidence: parsed.data.evidence,
      suggested_action: parsed.data.suggested_action ?? null,
      delivery_channel: null,
      delivered: false,
      dismissed: false,
      acted_on: false,
      source_app: parsed.data.source_app,
      source_operator: "oracle.analyzer",
      dedup_key: parsed.data.dedup_key,
    });
  }

  if (rows.length === 0) {
    return { written: 0, rejected };
  }

  const { error, count } = await admin
    .from("kinetiks_insights")
    .insert(rows, { count: "exact" });

  if (error) {
    throw new Error(`writeInsights failed: ${error.message}`);
  }

  // Phase 1.7.1 — close the most recent pending
  // kinetiks_id.connection_value_per_source observation for each
  // distinct source_app among the written insights. Outcome=1 by
  // definition: an insight got generated from that provider's
  // evidence, so the connection produced something useful in the
  // observation window. De-duped by provider so a batch of insights
  // from the same source doesn't close multiple observations.
  // Helper is a no-op when no pending row matches.
  const closedProviders = new Set<string>();
  for (const row of rows) {
    const provider = row.source_app as string;
    if (!provider || closedProviders.has(provider)) continue;
    closedProviders.add(provider);
    closeMostRecentConnectionEvidenceForProvider(
      {
        account_id: input.accountId,
        provider,
        outcome_recorded_via: "oracle_insight_citation",
      },
      admin,
    ).catch(() => undefined);
  }

  return { written: count ?? rows.length, rejected };
}
