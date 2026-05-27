/**
 * POST /api/archivist/patterns/sweep
 *
 * Per the Kinetiks Contract Addendum §1.6 (Lifecycle and Empirical
 * Decay Calibration). Phase 1 time-based pattern decay sweep.
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
import { registerKinetiksStateMachines } from "@/lib/state-machines-init";
import {
  runArchivistPatternSweepForAccount,
  type SweepAccountResult,
} from "@/lib/archivist/run-pattern-sweep";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const result = await runArchivistPatternSweepForAccount(admin, accountId);
    results.push(result);
  }

  return apiSuccess({
    accounts_processed: results.length,
    results,
  });
}
