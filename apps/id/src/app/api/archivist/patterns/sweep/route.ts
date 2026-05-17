/**
 * POST /api/archivist/patterns/sweep
 *
 * Per addendum §1.9. Phase 1 time-based pattern decay sweep.
 *
 * Algorithm per account (transactional):
 *   - For each pattern with status='validated' and user_starred=false:
 *       if now - last_observed_at > effective_decay_days * 0.7 days
 *       → transition to 'declining', write pattern_arbitrated Ledger
 *       (reason: 'time_decay')
 *   - For each pattern with status='declining' and user_starred=false:
 *       if now > decay_at
 *       → transition to 'archived', write pattern_archived AND
 *       pattern_arbitrated entries (reason: 'time_decay')
 *
 * User-starred patterns are exempt from automatic decay. They can
 * still be manually archived from the Cortex UI.
 *
 * Auth: INTERNAL_SERVICE_SECRET only (called from the archivist-cron
 * Edge Function). Customer-initiated decay does not exist in v1.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { assertTransition } from "@kinetiks/lib/state-machines";
import { registerKinetiksStateMachines } from "@/lib/state-machines-init";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALIDATED_TO_DECLINING_COEFFICIENT = 0.7;

interface SweepAccountResult {
  account_id: string;
  validated_to_declining: number;
  declining_to_archived: number;
  errors: string[];
}

export async function POST(request: Request) {
  registerKinetiksStateMachines();

  const { auth, error } = await requireAuth(request, { allowInternal: true });
  if (error) return error;
  if (auth.auth_method !== "internal") {
    return apiError("Internal service auth required", 403);
  }

  const body = await request.json().catch(() => ({}));
  const accountIds: string[] = Array.isArray(body?.account_ids)
    ? (body.account_ids as unknown[]).filter(
        (id): id is string => typeof id === "string" && UUID_REGEX.test(id),
      )
    : typeof body?.account_id === "string" && UUID_REGEX.test(body.account_id)
      ? [body.account_id]
      : [];

  if (accountIds.length === 0) {
    return apiError("Missing account_id or account_ids", 400);
  }

  const admin = createAdminClient();
  const results: SweepAccountResult[] = [];

  for (const accountId of accountIds) {
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

        // Two Ledger entries: a generic arbitrated (for the lifecycle
        // history view) and a specific archived (for query-side filtering).
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

    results.push(result);
  }

  return apiSuccess({
    accounts_processed: results.length,
    results,
  });
}
