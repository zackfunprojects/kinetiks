/**
 * POST /api/archivist/patterns/sweep-deferred
 *
 * Phase 1.7. For each account_id in the request body, calls
 * sweepExpiredDeferredObservations(): finds every pending
 * kinetiks_pattern_pending_observations row whose
 * outcome_window_expires_at has elapsed, flips it to 'expired', and
 * emits a pattern through /api/synapse/patterns with outcome_value=0.
 *
 * Invoked by supabase/functions/archivist-cron as a third pass after
 * /api/archivist/clean and /api/archivist/patterns/sweep.
 *
 * Auth: shared-secret bearer token (INTERNAL_SERVICE_SECRET).
 */

import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@kinetiks/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { runArchivistDeferredSweepForAccount } from "@/lib/archivist/run-deferred-sweep";

const Body = z.object({
  account_ids: z.array(z.string().uuid()).min(1),
});

export async function POST(request: Request) {
  const env = serverEnv();
  const secret = env.INTERNAL_SERVICE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "missing_internal_secret" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: err instanceof Error ? err.message : "invalid JSON",
      },
      { status: 400 },
    );
  }

  const origin = (() => {
    try {
      return new URL(request.url).origin;
    } catch {
      return env.NEXT_PUBLIC_APP_URL ?? null;
    }
  })();
  if (!origin) {
    return NextResponse.json(
      { error: "no_origin_resolvable" },
      { status: 500 },
    );
  }
  const patternsUrl = `${origin}/api/synapse/patterns`;

  const admin = createAdminClient();
  let totalScanned = 0;
  let totalExpired = 0;
  let totalEmitted = 0;
  let totalFailed = 0;
  const perAccount: Record<string, unknown> = {};

  for (const account_id of parsed.account_ids) {
    const result = await runArchivistDeferredSweepForAccount(admin, account_id, {
      patternsUrl,
      internalSecret: secret,
    });
    totalScanned += result.scanned;
    totalExpired += result.expired_count;
    totalEmitted += result.emitted_count;
    totalFailed += result.failed_count;
    // If the helper hit an unrecoverable error, surface it in the
    // per-account map exactly as the legacy route did.
    perAccount[account_id] = result.error
      ? { error: result.error }
      : {
          scanned: result.scanned,
          expired_count: result.expired_count,
          emitted_count: result.emitted_count,
          failed_count: result.failed_count,
        };
    if (result.error) totalFailed++;
  }

  return NextResponse.json({
    data: {
      accounts_processed: parsed.account_ids.length,
      scanned: totalScanned,
      expired: totalExpired,
      emitted: totalEmitted,
      failed: totalFailed,
      per_account: perAccount,
    },
  });
}
