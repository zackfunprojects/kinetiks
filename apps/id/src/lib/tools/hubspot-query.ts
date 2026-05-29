import "server-only";

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { defineTool } from "@kinetiks/tools";

import { createAdminClient } from "@/lib/supabase/admin";

// Phase 7 CR: paginate full result set instead of the legacy 5000-row
// cap, which silently truncated totals + buckets + new_in_window for
// large CRMs. Supabase caps at 1000 rows/page; we keyset on synced_at
// descending. MAX_PAGES is the safety ceiling — 50 pages × 1000 rows
// = 50k CRM entities, more than any single HubSpot subportal supports.
// If a customer ever blows through it, we Sentry-warn and surface
// partial data rather than crashing.
const HUBSPOT_PAGE_SIZE = 1000;
const HUBSPOT_MAX_PAGES = 50;

const GENERIC_HUBSPOT_QUERY_ERROR =
  "Couldn't read your HubSpot data right now. Try again in a moment.";
const GENERIC_HUBSPOT_CONNECTION_ERROR =
  "Couldn't verify your HubSpot connection right now. Try again in a moment.";

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
  // Phase 7 CR round 2: explicit truncated status when the
  // pagination safety cap is hit. Caller (Marcus) sees a structured
  // signal instead of an aggregate that silently undercounts large
  // portals. The reported aggregates are still computed off whatever
  // pages we did fetch, so they're a lower bound and labelled as such.
  z.object({
    status: z.literal("truncated"),
    entity_type: EntityType,
    partial_total: z.number().int().nonnegative(),
    partial_new_in_window: z.number().int().nonnegative(),
    partial_buckets: z.array(Bucket),
    window_days: z.number().int().nonnegative(),
    pages_walked: z.number().int().positive(),
    page_size: z.number().int().positive(),
    message: z.string(),
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

    // Phase 7 CR: distinguish DB error from not_connected. Previously
    // a DB error returned not_connected, which masked outages.
    const { data: conn, error: connError } = await admin
      .from("kinetiks_connections")
      .select("status")
      .eq("account_id", ctx.accountId)
      .eq("provider", "hubspot")
      .eq("status", "active")
      .maybeSingle();
    if (connError) {
      Sentry.captureException(connError, {
        tags: {
          route: "hubspot_query",
          action: "connection_check",
          stage: "select",
          app: "id",
        },
        user: { id: ctx.accountId },
        extra: { postgrest_code: connError.code },
      });
      return {
        status: "error" as const,
        message: GENERIC_HUBSPOT_CONNECTION_ERROR,
      };
    }
    if (!conn) {
      return {
        status: "not_connected" as const,
        message: "HubSpot is not connected. Connect it in the dashboard to read CRM data.",
      };
    }

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - input.recent_days);
    const cutoffIso = cutoff.toISOString();

    // Phase 7 CR: paginate the full result set so totals + buckets +
    // new_in_window are accurate for accounts with > 5000 CRM
    // entities. We order by synced_at descending and keyset on the
    // last seen synced_at (with id tiebreaker so equal-timestamp
    // batches don't loop forever).
    const rows: Array<{
      data: Record<string, unknown> | null;
      external_updated_at: string | null;
      synced_at: string | null;
      id: string;
    }> = [];
    let cursorSynced: string | null = null;
    let cursorId: string | null = null;
    let pagesWalked = 0;
    let hitPageCap = false;
    while (pagesWalked < HUBSPOT_MAX_PAGES) {
      let q = admin
        .from("kinetiks_crm_entities")
        .select("id, data, external_updated_at, synced_at")
        .eq("account_id", ctx.accountId)
        .eq("source", "hubspot")
        .eq("entity_type", input.entity_type)
        .order("synced_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(HUBSPOT_PAGE_SIZE);
      if (cursorSynced && cursorId) {
        // Strict-less-than keyset: (synced_at, id) < (cursor, cursorId)
        q = q.or(
          `synced_at.lt.${cursorSynced},and(synced_at.eq.${cursorSynced},id.lt.${cursorId})`,
        );
      }
      const { data: page, error: pageError } = await q;
      if (pageError) {
        Sentry.captureException(pageError, {
          tags: {
            route: "hubspot_query",
            action: "entities_query",
            stage: "page",
            app: "id",
          },
          user: { id: ctx.accountId },
          extra: {
            entity_type: input.entity_type,
            pages_walked: pagesWalked,
            postgrest_code: pageError.code,
          },
        });
        return {
          status: "error" as const,
          message: GENERIC_HUBSPOT_QUERY_ERROR,
        };
      }
      const pageRows = (page ?? []) as typeof rows;
      rows.push(...pageRows);
      pagesWalked++;
      if (pageRows.length < HUBSPOT_PAGE_SIZE) break;
      const last = pageRows[pageRows.length - 1];
      cursorSynced = last.synced_at;
      cursorId = last.id;
      if (pagesWalked >= HUBSPOT_MAX_PAGES) hitPageCap = true;
    }

    if (hitPageCap) {
      Sentry.captureMessage("[hubspot_query] page-walk cap reached", {
        level: "warning",
        tags: {
          route: "hubspot_query",
          action: "entities_query",
          stage: "cap",
          app: "id",
        },
        user: { id: ctx.accountId },
        extra: {
          entity_type: input.entity_type,
          rows_collected: rows.length,
        },
      });
    }

    const total = rows.length;
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
      for (const r of rows) {
        const t = r.external_updated_at ?? r.synced_at;
        if (t && t >= cutoffIso) newCount++;
      }
    }

    // Bucketing
    const buckets = new Map<string, { count: number; amount: number }>();
    const groupKey = input.group_by;

    for (const r of rows) {
      const data = r.data ?? {};
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

    // Phase 7 CR round 2: return `truncated` rather than `ok` when
    // the page cap is hit. Aggregates are computed from whatever we
    // did fetch (a lower bound), but the caller (Marcus) gets an
    // explicit signal that totals are partial. Marcus surfaces this
    // to the customer rather than presenting partial numbers as
    // authoritative.
    if (hitPageCap) {
      return {
        status: "truncated" as const,
        entity_type: input.entity_type,
        partial_total: total,
        partial_new_in_window: newCount,
        partial_buckets: bucketArray,
        window_days: input.recent_days,
        pages_walked: pagesWalked,
        page_size: HUBSPOT_PAGE_SIZE,
        message:
          "HubSpot has more CRM data than this tool reads in a single call. The numbers below are partial; ask the customer to narrow the scope (e.g. specific entity_type or stage) for accurate aggregates.",
      };
    }

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
