import "server-only";

import { assertTransition } from "@kinetiks/lib/state-machines";
import type { createAdminClient } from "@/lib/supabase/admin";

const VALIDATED_TO_DECLINING_COEFFICIENT = 0.7;

export interface SweepAccountResult {
  account_id: string;
  validated_to_declining: number;
  declining_to_archived: number;
  errors: string[];
}

/**
 * Per-account Pattern Library time-decay sweep. Extracted from
 * `apps/id/src/app/api/archivist/patterns/sweep/route.ts` so the
 * Phase 3 Workflow dispatcher can call it directly via the Archivist
 * operator. Algorithm and Ledger writes are identical to the route.
 *
 * Per the Kinetiks Contract Addendum §1.6:
 *  - `validated` patterns whose `last_observed_at` is older than
 *    `effective_decay_days * 0.7` move to `declining`.
 *  - `declining` patterns whose `decay_at` has passed move to
 *    `archived` (with both a `pattern_arbitrated` and a
 *    `pattern_archived` Ledger entry).
 *
 * User-starred patterns are exempt; the SELECT excludes them.
 */
export async function runArchivistPatternSweepForAccount(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
): Promise<SweepAccountResult> {
  const result: SweepAccountResult = {
    account_id: accountId,
    validated_to_declining: 0,
    declining_to_archived: 0,
    errors: [],
  };

  // ── validated → declining ──
  const declineCutoff = new Date().toISOString();
  const { data: validatedRows, error: validatedError } = await admin
    .from("kinetiks_pattern_library")
    .select("id, status, last_observed_at, effective_decay_days")
    .eq("account_id", accountId)
    .eq("status", "validated")
    .eq("user_starred", false);

  if (validatedError) {
    result.errors.push(`validated query: ${validatedError.message}`);
  } else {
    for (const row of validatedRows ?? []) {
      const lastObservedMs = new Date(row.last_observed_at as string).getTime();
      const ageMs = Date.now() - lastObservedMs;
      const declineThresholdMs =
        (row.effective_decay_days as number) *
        24 *
        60 *
        60 *
        1000 *
        VALIDATED_TO_DECLINING_COEFFICIENT;
      if (ageMs <= declineThresholdMs) continue;

      try {
        assertTransition({
          entity: "kinetiks_pattern_library",
          from: "validated",
          to: "declining",
          actor: { kind: "system", reason: "archivist-cron time-decay sweep" },
        });
      } catch (transitionErr) {
        result.errors.push(
          `assertTransition v→d ${row.id}: ${transitionErr instanceof Error ? transitionErr.message : "unknown"}`,
        );
        continue;
      }

      const { error: updateError } = await admin
        .from("kinetiks_pattern_library")
        .update({ status: "declining" })
        .eq("id", row.id as string)
        .eq("account_id", accountId);
      if (updateError) {
        result.errors.push(`update v→d ${row.id}: ${updateError.message}`);
        continue;
      }

      await admin.from("kinetiks_ledger").insert({
        account_id: accountId,
        event_type: "pattern_arbitrated",
        source_app: "kinetiks_id",
        source_operator: "archivist",
        target_layer: null,
        detail: {
          pattern_id: row.id,
          from: "validated",
          to: "declining",
          reason: "time_decay",
          triggered_at: declineCutoff,
        },
      });

      result.validated_to_declining += 1;
    }
  }

  // ── declining → archived ──
  const { data: decliningRows, error: decliningError } = await admin
    .from("kinetiks_pattern_library")
    .select("id, status, decay_at")
    .eq("account_id", accountId)
    .eq("status", "declining")
    .eq("user_starred", false)
    .lt("decay_at", new Date().toISOString());

  if (decliningError) {
    result.errors.push(`declining query: ${decliningError.message}`);
  } else {
    for (const row of decliningRows ?? []) {
      try {
        assertTransition({
          entity: "kinetiks_pattern_library",
          from: "declining",
          to: "archived",
          actor: { kind: "system", reason: "archivist-cron time-decay sweep" },
        });
      } catch (transitionErr) {
        result.errors.push(
          `assertTransition d→a ${row.id}: ${transitionErr instanceof Error ? transitionErr.message : "unknown"}`,
        );
        continue;
      }

      const { error: updateError } = await admin
        .from("kinetiks_pattern_library")
        .update({ status: "archived" })
        .eq("id", row.id as string)
        .eq("account_id", accountId);
      if (updateError) {
        result.errors.push(`update d→a ${row.id}: ${updateError.message}`);
        continue;
      }

      await admin.from("kinetiks_ledger").insert({
        account_id: accountId,
        event_type: "pattern_arbitrated",
        source_app: "kinetiks_id",
        source_operator: "archivist",
        target_layer: null,
        detail: {
          pattern_id: row.id,
          from: "declining",
          to: "archived",
          reason: "time_decay",
        },
      });
      await admin.from("kinetiks_ledger").insert({
        account_id: accountId,
        event_type: "pattern_archived",
        source_app: "kinetiks_id",
        source_operator: "archivist",
        target_layer: null,
        detail: {
          pattern_id: row.id,
          from: "declining",
          reason: "time_decay",
        },
      });

      result.declining_to_archived += 1;
    }
  }

  return result;
}
