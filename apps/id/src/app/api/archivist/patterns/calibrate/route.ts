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

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { bootPatternTypeRegistry } from "@/lib/patterns/registry-boot";
import {
  runArchivistCalibrateForAccount,
  type CalibrationAccountResult,
} from "@/lib/archivist/run-calibrate";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BodySchema = z.union([
  z.object({ account_ids: z.array(z.string()).min(1) }),
  z.object({ account_id: z.string() }),
]);

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
  const results: CalibrationAccountResult[] = [];

  for (const accountId of accountIds) {
    const result = await runArchivistCalibrateForAccount(admin, accountId, now);
    results.push(result);
  }

  // Aggregates mirror the deferred-sweep contract so the
  // archivist-cron summary can roll in-band per-account failures
  // into its `calibration_errors` count, not just transport failures.
  let totalFailed = 0;
  const perAccount: Record<string, CalibrationAccountResult> = {};
  for (const r of results) {
    totalFailed += r.errors.length;
    perAccount[r.account_id] = r;
  }

  return apiSuccess({
    accounts_processed: results.length,
    failed: totalFailed,
    per_account: perAccount,
    results,
  });
}
