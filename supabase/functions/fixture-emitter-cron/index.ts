// Fixture Emitter CRON Edge Function
//
// Phase 1.5 substrate: emits Harvest-shaped pattern fixtures so the
// Pattern Library lifecycle, Welford merge, Marcus brief inclusion,
// and downstream phases (Phase 2 decay calibration, Phase 4 Authority
// Agent) have signal to operate against without any real suite-app
// implementation. The Deno cron iterates accounts and POSTs to the
// Node-side route /api/internal/fixtures/emit, which holds the
// generator logic and the @kinetiks/types and pattern-write imports
// that Deno can't load.
//
// Gated on BOTH sides: this cron exits early if KINETIKS_FIXTURES_ENABLED
// is unset/false in the Supabase Edge Function env, AND the Node route
// re-checks the same flag via serverEnv() so a misconfigured deploy
// can't emit fixtures even if one side flips.
//
// CRON schedule: every 2 hours ("0 */2 * * *"). Generators produce
// ~5–20 patterns per account per run, so daily volume lands in the
// 60–240 range per account — enough for the Welford merge to
// re-arbitrate fingerprints multiple times within a 24h window.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const INTERNAL_SERVICE_SECRET = Deno.env.get("INTERNAL_SERVICE_SECRET");
const FIXTURES_ENABLED = Deno.env.get("KINETIKS_FIXTURES_ENABLED");
// IDENTITY_API_URL is required (no default). Defaulting to production
// would make a misconfigured staging deploy silently emit fixtures
// into prod. The cron fails closed if the env var is missing.
const IDENTITY_API_URL = Deno.env.get("IDENTITY_API_URL");

/** Maximum accounts to emit fixtures for in a single CRON run. */
const BATCH_LIMIT = 50;

/** Accounts to process per concurrent batch. */
const API_BATCH_SIZE = 5;

/** Timeout for each emit API call in milliseconds. */
const FETCH_TIMEOUT_MS = 30_000;

interface EmitResponse {
  status?: string;
  emitted?: number;
  failed?: number;
}

Deno.serve(async () => {
  if (FIXTURES_ENABLED !== "true" && FIXTURES_ENABLED !== "1") {
    return new Response(
      JSON.stringify({ status: "disabled", reason: "KINETIKS_FIXTURES_ENABLED is not true" }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !INTERNAL_SERVICE_SECRET ||
    !IDENTITY_API_URL
  ) {
    console.error(
      "[fixture-emitter-cron] Missing required environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INTERNAL_SERVICE_SECRET, IDENTITY_API_URL)",
    );
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Iterate every account. Production runs with FIXTURES_ENABLED=false
  // so production never reaches this point; in dev/staging, fixtures
  // run for every account in scope. Order by created_at DESC and use a
  // bounded LIMIT for fairness — without an ORDER BY, repeated runs
  // can keep processing the same arbitrary slice. Newest-first means
  // newly-created accounts get fixture coverage immediately. v1 is
  // fine without keyset cursors since the dev/staging account count
  // is well under BATCH_LIMIT; revisit if that changes.
  const { data: accounts, error } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(BATCH_LIMIT);

  if (error) {
    // Don't leak raw PostgREST error text over the network. Server
    // logs keep the detail; the response stays generic.
    console.error("[fixture-emitter-cron] Failed to query accounts:", error);
    return new Response(JSON.stringify({ error: "accounts_query_failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!accounts?.length) {
    return new Response(
      JSON.stringify({ processed: 0, message: "No accounts" }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const accountIds = accounts.map((a) => a.id as string);
  let totalEmitted = 0;
  let totalFailed = 0;
  let totalProcessed = 0;
  // When the Node side reports KINETIKS_FIXTURES_ENABLED=false, we
  // stop processing further accounts. Otherwise every account in the
  // batch list still gets a fetch, even though all of them no-op.
  let nodeSideDisabled = false;

  for (let i = 0; i < accountIds.length; i += API_BATCH_SIZE) {
    if (nodeSideDisabled) break;
    const batch = accountIds.slice(i, i + API_BATCH_SIZE);

    const promises = batch.map(async (accountId) => {
      if (nodeSideDisabled) return;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(`${IDENTITY_API_URL}/api/internal/fixtures/emit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${INTERNAL_SERVICE_SECRET}`,
          },
          body: JSON.stringify({ account_id: accountId }),
          signal: controller.signal,
        });

        if (!response.ok) {
          console.error(
            `[fixture-emitter-cron] Emit API returned ${response.status} for account ${accountId}`,
          );
          totalFailed++;
          return;
        }

        const result = (await response.json()) as EmitResponse;
        if (result.status === "disabled") {
          // Node side disagrees about the flag — bail out of the
          // entire run rather than continuing to fetch for every
          // remaining account.
          console.log(
            `[fixture-emitter-cron] Node side reports KINETIKS_FIXTURES_ENABLED=false; aborting remaining batches`,
          );
          nodeSideDisabled = true;
          return;
        }
        totalEmitted += result.emitted ?? 0;
        totalFailed += result.failed ?? 0;
        totalProcessed++;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          console.error(
            `[fixture-emitter-cron] Emit API timed out after ${FETCH_TIMEOUT_MS}ms for account ${accountId}`,
          );
        } else {
          console.error(
            `[fixture-emitter-cron] Failed to call emit API for account ${accountId}:`,
            err,
          );
        }
        totalFailed++;
      } finally {
        clearTimeout(timer);
      }
    });

    await Promise.all(promises);
  }

  const summary = {
    accounts_queried: accountIds.length,
    accounts_processed: totalProcessed,
    total_emitted: totalEmitted,
    total_failed: totalFailed,
  };

  console.log("[fixture-emitter-cron] Run complete:", JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
