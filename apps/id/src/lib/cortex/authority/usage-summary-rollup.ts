/**
 * Authority Grant `usage_summary` rollup per the Kinetiks Contract Addendum §2.3.
 *
 * Every `authority_action_taken` and `authority_action_escalated` event
 * is logged to the Ledger with `grant_id` attached. The grant's
 * `usage_summary` jsonb on `kinetiks_authority_grants` is the rolled-up
 * customer-facing view of that activity:
 *
 *   {
 *     action_counts: { "<action_class>": N, ... },
 *     total_spend_under_grant: number,    // always 0 in v1 (no spend classes)
 *     escalations_triggered: number,
 *     outcome_metrics: Record<string, number>,
 *     computed_at: string
 *   }
 *
 * The rollup runs nightly (intended cadence). Phase 4 ships the
 * function; wiring into the Archivist maintenance workflow lands
 * alongside the Chunk 8 UI or earlier as a follow-up task. Until
 * wired, the resolver's pacing trigger reads the live counter for
 * sub-day windows and the (initially empty) usage_summary for daily+
 * windows — accurate, just less efficient than steady-state.
 *
 * Server-side only.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@kinetiks/supabase";
import type { AuthorityUsageSummary } from "@kinetiks/types";

interface RollupRow {
  grant_id: string;
  event_type: string;
  detail: Record<string, unknown> | null;
}

export interface RollupResult {
  grants_updated: number;
  events_rolled: number;
  errors: number;
}

/**
 * Roll up Ledger events into each non-terminal grant's `usage_summary`.
 *
 * Strategy: for each `(grant_id IS NOT NULL, status IN proposed/active/paused)`
 * grant, recompute `action_counts` from authority_action_taken events
 * since the grant's `granted_at`, plus `escalations_triggered` from
 * authority_action_escalated since the same window. Write back to the
 * grant row.
 *
 * O(N) over non-terminal grants per nightly run; the index
 * `idx_ledger_grant_event_created` makes the per-grant scan efficient.
 */
export async function rollUpUsageSummaries(): Promise<RollupResult> {
  const admin = createAdminClient();

  const { data: grants, error: grantsErr } = await (
    admin as unknown as SupabaseClient
  )
    .from("kinetiks_authority_grants")
    .select("id, granted_at")
    .in("status", ["proposed", "active", "paused"])
    .not("granted_at", "is", null);

  if (grantsErr) {
    throw new Error(`[authority/usage-rollup] grants fetch: ${grantsErr.message}`);
  }
  if (!grants || grants.length === 0) {
    return { grants_updated: 0, events_rolled: 0, errors: 0 };
  }

  let grants_updated = 0;
  let events_rolled = 0;
  let errors = 0;

  for (const g of grants as Array<{ id: string; granted_at: string }>) {
    try {
      const { data: events, error: eventsErr } = await (
        admin as unknown as SupabaseClient
      )
        .from("kinetiks_ledger")
        .select("grant_id, event_type, detail")
        .eq("grant_id", g.id)
        .in("event_type", ["authority_action_taken", "authority_action_escalated"])
        .gte("created_at", g.granted_at);

      if (eventsErr) {
        errors += 1;
        continue;
      }

      const rows = (events ?? []) as RollupRow[];
      const action_counts: Record<string, number> = {};
      let escalations_triggered = 0;
      for (const e of rows) {
        if (e.event_type === "authority_action_taken") {
          const cls =
            typeof e.detail?.action_class === "string"
              ? e.detail.action_class
              : "unknown";
          action_counts[cls] = (action_counts[cls] ?? 0) + 1;
        } else if (e.event_type === "authority_action_escalated") {
          escalations_triggered += 1;
        }
      }
      events_rolled += rows.length;

      const usage_summary: AuthorityUsageSummary = {
        action_counts,
        // v1: no spend-bearing classes ship to production; always 0.
        total_spend_under_grant: 0,
        escalations_triggered,
        outcome_metrics: {},
        computed_at: new Date().toISOString(),
      };

      const { error: writeErr } = await (admin as unknown as SupabaseClient)
        .from("kinetiks_authority_grants")
        .update({ usage_summary })
        .eq("id", g.id);

      if (writeErr) {
        errors += 1;
        continue;
      }
      grants_updated += 1;
    } catch {
      errors += 1;
    }
  }

  return { grants_updated, events_rolled, errors };
}
