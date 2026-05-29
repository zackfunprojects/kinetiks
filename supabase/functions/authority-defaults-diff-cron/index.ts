// Authority Defaults Diff CRON Edge Function
//
// Phase 5 — Kinetiks Contract Addendum §2.6.
//
// For every account that has completed the signup Permissions step
// (kinetiks_accounts.authority_defaults_reviewed_at IS NOT NULL),
// detect manifest-declared default standing grants the customer has
// not yet accepted and propose them via the standard
// `propose_authority_grants` flow. Customer reviews the proposal in
// the existing Approvals UI.
//
// Honors a 30-day cooldown for defaults the customer previously
// rejected (authority_default_rejected) or skipped
// (authority_default_skipped) at signup. The cooldown is a soft
// guard against pestering; the structural guard is the unique partial
// index on (account_id, default_origin_app, default_origin_key) for
// non-terminal grants added in migration 00055.
//
// Deno + Node split per CLAUDE.md Lesson 7: the cron itself is Deno
// (queries Supabase only), but the diff logic lives in
// apps/id/src/app/api/internal/authority-defaults-diff/refresh/route.ts
// because that's where the manifest registry lives. The Edge Function
// fans out per-account POST calls to the internal route.
//
// CRON schedule: daily at 07:00 UTC ("0 7 * * *") — chosen so it
// runs before most US-Pacific working hours but after EU mornings,
// minimizing the chance that a customer sees a new proposal land
// while they are actively in the Approvals UI.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const INTERNAL_SERVICE_SECRET = Deno.env.get("INTERNAL_SERVICE_SECRET");
const KINETIKS_ID_API_URL =
  Deno.env.get("KINETIKS_ID_API_URL") || "https://kinetiks.ai";

/** Maximum accounts to process per CRON run. */
const BATCH_LIMIT = 200;

/** Accounts to dispatch in parallel within a batch. */
const PARALLEL_BATCH_SIZE = 10;

/** Per-account refresh timeout (ms). */
const FETCH_TIMEOUT_MS = 30_000;

interface RefreshResponse {
  success?: boolean;
  data?: {
    proposals_created?: number;
    cooldown_skipped?: number;
    already_covered?: number;
    error?: string;
  };
}

Deno.serve(async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !INTERNAL_SERVICE_SECRET) {
    console.error("[authority-defaults-diff-cron] Missing required environment variables");
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Accounts that have completed the Permissions step at signup. Any
  // account with authority_defaults_reviewed_at IS NULL is mid-flow
  // (or hasn't reached the step) and the cron must not race their
  // signup decision.
  const { data: accounts, error } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .not("authority_defaults_reviewed_at", "is", null)
    .order("authority_defaults_reviewed_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error(
      "[authority-defaults-diff-cron] account query failed:",
      error,
    );
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!accounts?.length) {
    return new Response(
      JSON.stringify({
        accounts_queried: 0,
        proposals_created: 0,
        message: "No reviewed accounts to scan",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const accountIds = accounts.map((a) => a.id as string);
  let totalProposalsCreated = 0;
  let totalCooldownSkipped = 0;
  let totalAlreadyCovered = 0;
  let totalProcessed = 0;
  let totalErrors = 0;

  for (let i = 0; i < accountIds.length; i += PARALLEL_BATCH_SIZE) {
    const batch = accountIds.slice(i, i + PARALLEL_BATCH_SIZE);

    const promises = batch.map(async (accountId) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(
          `${KINETIKS_ID_API_URL}/api/internal/authority-defaults-diff/refresh`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${INTERNAL_SERVICE_SECRET}`,
            },
            body: JSON.stringify({ account_id: accountId }),
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          console.error(
            `[authority-defaults-diff-cron] refresh API returned ${response.status} for account ${accountId}`,
          );
          totalErrors++;
          return;
        }
        const result = (await response.json()) as RefreshResponse;
        totalProposalsCreated += result.data?.proposals_created ?? 0;
        totalCooldownSkipped += result.data?.cooldown_skipped ?? 0;
        totalAlreadyCovered += result.data?.already_covered ?? 0;
        totalProcessed++;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          console.error(
            `[authority-defaults-diff-cron] refresh API timed out after ${FETCH_TIMEOUT_MS}ms for account ${accountId}`,
          );
        } else {
          console.error(
            `[authority-defaults-diff-cron] refresh failed for account ${accountId}:`,
            err,
          );
        }
        totalErrors++;
      } finally {
        clearTimeout(timer);
      }
    });

    await Promise.all(promises);
  }

  const summary = {
    accounts_queried: accountIds.length,
    accounts_processed: totalProcessed,
    proposals_created: totalProposalsCreated,
    cooldown_skipped: totalCooldownSkipped,
    already_covered: totalAlreadyCovered,
    errors: totalErrors,
  };

  console.log(
    "[authority-defaults-diff-cron] Run complete:",
    JSON.stringify(summary),
  );

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
