import "server-only";

import { z } from "zod";
import { defineTool } from "@kinetiks/tools";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Marcus tool — read HubSpot CRM aggregates.
 *
 * Source: `kinetiks_crm_entities` (source='hubspot'), populated by the
 * HubSpot sync handler. Three query shapes:
 *   - `entity_type='deal'`     → pipeline summary (counts per stage, total amount)
 *   - `entity_type='contact'`  → contact count + new-contacts-in-window
 *   - `entity_type='company'`  → company count
 *
 * PII rules: HubSpot data is already PII-stripped on write (email/phone
 * → sha256 hashes, names dropped, addresses → city/state/country only).
 * This tool returns aggregates and hashes, never raw identifiers, so it
 * is safe to surface in Marcus output without further redaction.
 */

const EntityType = z.enum(["deal", "contact", "company"]);

const Input = z.object({
  entity_type: EntityType,
  /** For deals: aggregate by stage. For contacts: by lifecycle_stage. */
  group_by: z.enum(["overall", "stage", "lifecycle_stage"]).default("overall"),
  /** Optional window for "new in last N days". 0 = no filter. */
  recent_days: z.number().int().min(0).max(365).default(28),
});

const Bucket = z.object({
  key: z.string(),
  count: z.number().int().nonnegative(),
  total_amount: z.number().optional(),
});

const Output = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    entity_type: EntityType,
    total: z.number().int().nonnegative(),
    new_in_window: z.number().int().nonnegative(),
    buckets: z.array(Bucket),
    window_days: z.number().int().nonnegative(),
  }),
  z.object({
    status: z.literal("not_connected"),
    message: z.string(),
  }),
  z.object({
    status: z.literal("error"),
    message: z.string(),
  }),
]);

export const hubspotQueryTool = defineTool({
  name: "hubspot_query",
  description:
    "Read the customer's HubSpot CRM aggregates. For entity_type='deal' returns deal counts and total amount per stage. For entity_type='contact' returns contact counts (optionally grouped by lifecycle_stage). For entity_type='company' returns company counts. Always returns aggregates only — never raw names, emails, or contact details (those are hashed at write time per CLAUDE.md PII rules). Returns `not_connected` when HubSpot is not connected. Use when the user asks about their pipeline, deal stages, contact growth, or how many customers are in CRM.",
  inputSchema: Input,
  outputSchema: Output,
  isConsequential: false,
  autoApproveThreshold: null,
  availability: { kind: "connection_required", provider: "hubspot" },
  connection_provider: "hubspot",
  cortex_layer: "customers",
  execute: async (input, ctx) => {
    const admin = createAdminClient();

    const { data: conn } = await admin
      .from("kinetiks_connections")
      .select("status")
      .eq("account_id", ctx.accountId)
      .eq("provider", "hubspot")
      .eq("status", "active")
      .maybeSingle();
    if (!conn) {
      return {
        status: "not_connected" as const,
        message: "HubSpot is not connected. Connect it in the dashboard to read CRM data.",
      };
    }

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - input.recent_days);
    const cutoffIso = cutoff.toISOString();

    const { data: rows, error } = await admin
      .from("kinetiks_crm_entities")
      .select("data, external_updated_at, synced_at")
      .eq("account_id", ctx.accountId)
      .eq("source", "hubspot")
      .eq("entity_type", input.entity_type)
      .limit(5000);
    if (error) {
      console.error(`[hubspot_query] read failed: ${error.message}`);
      return {
        status: "error" as const,
        message: "Couldn't read your HubSpot data right now. Try again in a moment.",
      };
    }

    const total = rows?.length ?? 0;
    if (total === 0) {
      return {
        status: "ok" as const,
        entity_type: input.entity_type,
        total: 0,
        new_in_window: 0,
        buckets: [],
        window_days: input.recent_days,
      };
    }

    // "New in window" — counted against external_updated_at where
    // present (most-recent provider-side change), falling back to
    // our synced_at when absent. Conservative: false negatives are
    // OK; false positives (counting an old deal as "new") are not.
    let newCount = 0;
    if (input.recent_days > 0) {
      for (const r of rows ?? []) {
        const t = (r.external_updated_at as string | null) ?? (r.synced_at as string | null);
        if (t && t >= cutoffIso) newCount++;
      }
    }

    // Bucketing
    const buckets = new Map<string, { count: number; amount: number }>();
    const groupKey = input.group_by;

    for (const r of rows ?? []) {
      const data = (r.data as Record<string, unknown>) ?? {};
      let key: string;
      if (groupKey === "overall") {
        key = "overall";
      } else if (input.entity_type === "deal" && groupKey === "stage") {
        key = (data.stage_id as string | undefined) ?? "unstaged";
      } else if (input.entity_type === "contact" && groupKey === "lifecycle_stage") {
        key = (data.lifecycle_stage as string | undefined) ?? "unspecified";
      } else {
        key = "overall";
      }

      const existing = buckets.get(key) ?? { count: 0, amount: 0 };
      existing.count += 1;
      if (input.entity_type === "deal" && typeof data.amount === "number") {
        existing.amount += data.amount;
      }
      buckets.set(key, existing);
    }

    const bucketArray = Array.from(buckets.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([key, v]) => ({
        key,
        count: v.count,
        ...(input.entity_type === "deal" && groupKey !== "overall"
          ? { total_amount: Math.round(v.amount * 100) / 100 }
          : {}),
      }));

    return {
      status: "ok" as const,
      entity_type: input.entity_type,
      total,
      new_in_window: newCount,
      buckets: bucketArray,
      window_days: input.recent_days,
    };
  },
});
