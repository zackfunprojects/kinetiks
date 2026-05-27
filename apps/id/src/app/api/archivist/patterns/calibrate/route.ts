/**
 * POST /api/archivist/patterns/calibrate
 *
 * Per the Kinetiks Contract Addendum §1.6 (Lifecycle and Empirical
 * Decay Calibration). Phase 2 nightly empirical decay calibration.
 *
 * For each account in the request, page through eligible patterns and
 * call `calibratePattern()`. On an `extend` or `shorten` decision,
 * atomically UPDATE `kinetiks_pattern_library` with a check-and-set
 * on the prior `effective_decay_days` value (defensive against
 * concurrent emission writes) and INSERT a `pattern_decay_calibrated`
 * Ledger entry capturing prior/next values, observed variance, and
 * the rationale.
 *
 * Eligibility, decision algorithm, dead-band, and clamp semantics
 * live in `decay-calibration.ts` (pure). The declining-transitions
 * window is fetched once per account by `declining-history.ts`.
 *
 * Auth: INTERNAL_SERVICE_SECRET only (called from the archivist-cron
 * Edge Function at the 00:00 UTC tick). Customer-initiated
 * calibration does not exist in v1.
 */

import "server-only";

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import type { Pattern, PatternTypeDescriptor } from "@kinetiks/types";
import { getPatternType } from "@kinetiks/tools";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { bootPatternTypeRegistry } from "@/lib/patterns/registry-boot";
import {
  calibratePattern,
  type CalibrationDecision,
} from "@/lib/patterns/decay-calibration";
import { fetchDecliningCountsForAccount } from "@/lib/patterns/declining-history";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Page size when scanning eligible patterns per account. */
const PATTERN_PAGE_SIZE = 100;

/** Lowest known descriptor threshold across the registry (defensive). */
const MIN_OBSERVATION_COUNT_FOR_QUERY = 2;

const BodySchema = z.union([
  z.object({ account_ids: z.array(z.string()).min(1) }),
  z.object({ account_id: z.string() }),
]);

interface CalibrationAccountResult {
  account_id: string;
  patterns_evaluated: number;
  patterns_moved: number;
  patterns_skipped: number;
  patterns_raced: number;
  errors: string[];
}

export async function POST(request: Request) {
  bootPatternTypeRegistry();

  const { auth, error } = await requireAuth(request, { allowInternal: true });
  if (error) return error;
  if (auth.auth_method !== "internal") {
    return apiError("Internal service auth required", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Missing account_id or account_ids", 400);
  }
  const accountIds: string[] = Array.isArray(
    (parsed.data as { account_ids?: string[] }).account_ids,
  )
    ? (parsed.data as { account_ids: string[] }).account_ids.filter((id) =>
        UUID_REGEX.test(id),
      )
    : [((parsed.data as { account_id: string }).account_id ?? "").trim()].filter(
        (id) => UUID_REGEX.test(id),
      );
  if (accountIds.length === 0) {
    return apiError("Missing account_id or account_ids", 400);
  }

  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const results: CalibrationAccountResult[] = [];

  for (const accountId of accountIds) {
    const result: CalibrationAccountResult = {
      account_id: accountId,
      patterns_evaluated: 0,
      patterns_moved: 0,
      patterns_skipped: 0,
      patterns_raced: 0,
      errors: [],
    };

    try {
      // One Ledger query per account for the declining-history signal.
      const decliningCounts = await fetchDecliningCountsForAccount({
        admin,
        account_id: accountId,
        now,
      });

      // Page through eligible patterns. Defensive observation_count
      // floor at MIN_OBSERVATION_COUNT_FOR_QUERY (2); the pure
      // function applies the descriptor's specific threshold inside
      // its skip branch.
      let offset = 0;
      while (true) {
        const { data: page, error: pageErr } = await admin
          .from("kinetiks_pattern_library")
          .select("*")
          .eq("account_id", accountId)
          .neq("status", "archived")
          .gte("observation_count", MIN_OBSERVATION_COUNT_FOR_QUERY)
          .order("id", { ascending: true })
          .range(offset, offset + PATTERN_PAGE_SIZE - 1);

        if (pageErr) {
          result.errors.push(
            `page ${offset}: ${pageErr.message} (${pageErr.code})`,
          );
          Sentry.captureException(new Error(pageErr.message), {
            tags: {
              route: "archivist/patterns/calibrate",
              action: "fetch_page",
              stage: "select",
              app: "id",
            },
            extra: { account_id: accountId, offset },
          });
          break;
        }
        if (!page || page.length === 0) break;

        for (const row of page) {
          await processPattern({
            pattern: row as unknown as Pattern,
            decliningCounts,
            admin,
            accountId,
            nowIso,
            now,
            result,
          });
        }

        if (page.length < PATTERN_PAGE_SIZE) break;
        offset += PATTERN_PAGE_SIZE;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      result.errors.push(`account loop: ${msg}`);
      Sentry.captureException(err, {
        tags: {
          route: "archivist/patterns/calibrate",
          action: "account_loop",
          stage: "iterate",
          app: "id",
        },
        extra: { account_id: accountId },
      });
    }

    results.push(result);
  }

  return apiSuccess({
    accounts_processed: results.length,
    results,
  });
}

// ============================================================
// Per-pattern processing
// ============================================================

async function processPattern(args: {
  pattern: Pattern;
  decliningCounts: Map<string, number>;
  admin: ReturnType<typeof createAdminClient>;
  accountId: string;
  nowIso: string;
  now: Date;
  result: CalibrationAccountResult;
}): Promise<void> {
  const { pattern, decliningCounts, admin, accountId, nowIso, now, result } =
    args;
  result.patterns_evaluated += 1;

  const descriptor: PatternTypeDescriptor | undefined = getPatternType(
    pattern.pattern_type,
  );
  if (!descriptor) {
    // Pattern type not registered. Skip silently; this is normally
    // unreachable because the Pattern Type Registry boot would have
    // failed first.
    result.patterns_skipped += 1;
    return;
  }

  const decision: CalibrationDecision = calibratePattern({
    pattern,
    descriptor,
    recent_declining_count: decliningCounts.get(pattern.id) ?? 0,
    now,
  });

  if (decision.decision !== "extend" && decision.decision !== "shorten") {
    result.patterns_skipped += 1;
    return;
  }

  // Atomic check-and-set on prior effective_decay_days. If an
  // emission landed between our SELECT and this UPDATE, the WHERE
  // filter drops the row; we count it as raced and move on.
  const { data: updated, error: updateErr } = await admin
    .from("kinetiks_pattern_library")
    .update({
      effective_decay_days: decision.next_effective_decay_days,
      decay_at: decision.next_decay_at,
      updated_at: nowIso,
    })
    .eq("id", pattern.id)
    .eq("account_id", accountId)
    .eq("effective_decay_days", decision.prior_effective_decay_days)
    .select("id");

  if (updateErr) {
    result.errors.push(`update ${pattern.id}: ${updateErr.message}`);
    Sentry.captureException(new Error(updateErr.message), {
      tags: {
        route: "archivist/patterns/calibrate",
        action: "update_pattern",
        stage: "update",
        app: "id",
      },
      extra: {
        account_id: accountId,
        pattern_id: pattern.id,
        pattern_type: pattern.pattern_type,
        decision: decision.decision,
      },
    });
    return;
  }

  if (!updated || updated.length === 0) {
    // Lost a race with an emission. Don't write a Ledger entry; the
    // next calibration tick will pick up the fresh state.
    result.patterns_raced += 1;
    return;
  }

  const { error: ledgerErr } = await admin.from("kinetiks_ledger").insert({
    account_id: accountId,
    event_type: "pattern_decay_calibrated",
    source_app: "kinetiks_id",
    source_operator: "archivist",
    target_layer: null,
    detail: {
      pattern_id: pattern.id,
      pattern_type: pattern.pattern_type,
      prior_effective_decay_days: decision.prior_effective_decay_days,
      next_effective_decay_days: decision.next_effective_decay_days,
      prior_decay_at: decision.prior_decay_at,
      next_decay_at: decision.next_decay_at,
      observed_variance: pattern.variance,
      observation_count: pattern.observation_count,
      declining_transitions_in_window:
        decliningCounts.get(pattern.id) ?? 0,
      decision: decision.decision,
      rationale: decision.rationale,
    },
  });

  if (ledgerErr) {
    result.errors.push(`ledger ${pattern.id}: ${ledgerErr.message}`);
    Sentry.captureException(new Error(ledgerErr.message), {
      tags: {
        route: "archivist/patterns/calibrate",
        action: "ledger_insert",
        stage: "insert",
        app: "id",
      },
      extra: {
        account_id: accountId,
        pattern_id: pattern.id,
        pattern_type: pattern.pattern_type,
      },
    });
    return;
  }

  result.patterns_moved += 1;
}
