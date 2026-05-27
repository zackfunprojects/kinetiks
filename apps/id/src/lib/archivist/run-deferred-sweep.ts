import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { sweepExpiredDeferredObservations } from "@/lib/patterns/deferred-emit";

/**
 * Per-account result of one deferred-observation sweep. Mirrors the
 * route's per-account body so the
 * `apps/id/src/app/api/archivist/patterns/sweep-deferred/route.ts`
 * aggregation shape is preserved.
 */
export interface DeferredSweepAccountResult {
  scanned: number;
  expired_count: number;
  emitted_count: number;
  failed_count: number;
  /** Present iff the sweep failed catastrophically for this account. */
  error?: string;
}

export interface RunDeferredSweepDeps {
  patternsUrl: string;
  internalSecret: string;
}

/**
 * Per-account Phase 1.7 deferred-emission close. Extracted from the
 * sweep-deferred route so the Phase 3 Workflow dispatcher can invoke
 * the helper directly via the Archivist operator (no self-HTTP).
 *
 * Wraps `sweepExpiredDeferredObservations` to catch and report
 * per-account failures in the same shape the route uses.
 */
export async function runArchivistDeferredSweepForAccount(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  deps: RunDeferredSweepDeps,
): Promise<DeferredSweepAccountResult> {
  try {
    const result = await sweepExpiredDeferredObservations(
      {
        patternsUrl: deps.patternsUrl,
        internalSecret: deps.internalSecret,
        account_id: accountId,
      },
      admin,
    );
    return {
      scanned: result.scanned,
      expired_count: result.expired_count,
      emitted_count: result.emitted_count,
      failed_count: result.failed_count,
    };
  } catch (err) {
    return {
      scanned: 0,
      expired_count: 0,
      emitted_count: 0,
      failed_count: 0,
      error: err instanceof Error ? err.message : "unknown error",
    };
  }
}
