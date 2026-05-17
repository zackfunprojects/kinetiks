/**
 * POST /api/internal/metric-cache/refresh
 *
 * The Node-side worker that actually hits provider APIs (GA4 today;
 * Stripe + GSC in D3). Invoked by supabase/functions/metric-cache-cron
 * via fetch with INTERNAL_SERVICE_SECRET, because the cron itself runs
 * under Deno and cannot import @google-analytics/data.
 *
 * Auth: shared-secret bearer token. Not exposed to clients (no client
 * call path exists). Never publish this URL.
 *
 * Body shape (validated):
 *   { account_id, source, normalized_input_hash }
 *
 * Flow:
 *   1. Verify INTERNAL_SERVICE_SECRET
 *   2. Read the cache row to recover `input` (we never re-derive the
 *      query from the hash; the row itself is the source of truth)
 *   3. Acquire the advisory lock; if contended, skip (cron will retry)
 *   4. Resolve the connection, withFreshToken + runGa4Query
 *   5. Write the new cache row with refreshed_at = now()
 *
 * Response shapes:
 *   200 { ok: true, status: 'refreshed' | 'skipped' }
 *   400 { error: 'invalid_body' }
 *   401 { error: 'unauthorized' }
 *   404 { error: 'cache_row_missing' | 'connection_missing' }
 *   500 { error: 'refresh_failed', message }
 */

import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConnectionByProvider } from "@/lib/connections/manager";
import {
  getCachedMetric,
  withRefreshLock,
  writeCachedMetric,
} from "@/lib/connections/metric-cache";
import { withFreshToken } from "@/lib/connections/refresh-token";
import {
  createGa4Client,
  getStaleAfterSeconds,
  runGa4Query,
  type Ga4Query,
} from "@/lib/connections/extractors/ga4";

const Body = z.object({
  account_id: z.string().uuid(),
  source: z.string().min(1).max(32),
  normalized_input_hash: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "missing_internal_secret" },
      { status: 500 }
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
      { status: 400 }
    );
  }

  // D1 only knows how to refresh GA4. D3 dispatches by source.
  if (parsed.source !== "ga4") {
    return NextResponse.json(
      { error: "unsupported_source", source: parsed.source },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const cached = await getCachedMetric(admin, {
    account_id: parsed.account_id,
    source: parsed.source,
    normalized_input_hash: parsed.normalized_input_hash,
  });

  if (!cached) {
    // Nothing to refresh — possibly the row was deleted between the cron
    // scan and this call. Treat as benign skip.
    return NextResponse.json({ ok: true, status: "skipped" });
  }

  const connection = await getConnectionByProvider(
    admin,
    parsed.account_id,
    "ga4"
  );
  if (!connection || connection.status !== "active") {
    return NextResponse.json(
      { error: "connection_missing" },
      { status: 404 }
    );
  }

  const propertyId =
    typeof connection.metadata?.property_id === "string"
      ? connection.metadata.property_id
      : null;
  if (!propertyId) {
    return NextResponse.json(
      { error: "property_missing" },
      { status: 404 }
    );
  }

  // Reconstruct the Ga4Query from the canonical input we stored on the
  // cache row. We deliberately don't trust the hash for reconstruction —
  // it's a cache key, not a Ga4Query encoder.
  const ga4Query = (cached.input ?? {}) as unknown as Ga4Query & {
    property_id?: string;
  };

  const lockResult = await withRefreshLock(
    admin,
    {
      account_id: parsed.account_id,
      source: parsed.source,
      normalized_input_hash: parsed.normalized_input_hash,
    },
    () =>
      withFreshToken(admin, connection, async (creds) => {
        const client = await createGa4Client(creds);
        return runGa4Query(client, propertyId, ga4Query);
      })
  );

  if (!lockResult.acquired) {
    return NextResponse.json({ ok: true, status: "skipped" });
  }

  try {
    await writeCachedMetric(admin, {
      account_id: parsed.account_id,
      source: parsed.source,
      input: cached.input,
      response: lockResult.result as unknown as Record<string, unknown>,
      stale_after_seconds: getStaleAfterSeconds(ga4Query),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "refresh_failed",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, status: "refreshed" });
}
