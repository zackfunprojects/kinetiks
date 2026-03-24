// Archivist CRON Edge Function
//
// Runs every 6 hours. Triggers a full clean pass for all onboarded accounts
// via the /api/archivist/clean endpoint. The clean pass includes deduplication,
// normalization, gap detection, and quality scoring.
//
// CRON schedule: every 6 hours ("0 */6 * * *")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const INTERNAL_SERVICE_SECRET = Deno.env.get("INTERNAL_SERVICE_SECRET");
const APP_URL =
  Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://id.kinetiks.ai";

/** Maximum accounts to process per CRON run. */
const ACCOUNT_LIMIT = 200;

/** Accounts per API call (clean pass is heavier than evaluate). */
const API_BATCH_SIZE = 5;

/** Timeout for each clean API call in milliseconds. */
const FETCH_TIMEOUT_MS = 60_000;

/** Delay between batches in milliseconds to avoid overwhelming the endpoint. */
const BATCH_DELAY_MS = 2_000;

Deno.serve(async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !INTERNAL_SERVICE_SECRET) {
    console.error("[archivist-cron] Missing required environment variables");
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Get all onboarded accounts
  const { data: accounts, error: accountsErr } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("onboarding_complete", true)
    .limit(ACCOUNT_LIMIT);

  if (accountsErr) {
    console.error("[archivist-cron] Failed to query accounts:", accountsErr);
    return new Response(JSON.stringify({ error: accountsErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!accounts?.length) {
    return new Response(
      JSON.stringify({ processed: 0, message: "No accounts to audit" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const allIds = accounts.map((a) => a.id as string);
  let accountsProcessed = 0;
  let totalErrors = 0;

  // Process in batches
  for (let i = 0; i < allIds.length; i += API_BATCH_SIZE) {
    const batchIds = allIds.slice(i, i + API_BATCH_SIZE);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(`${APP_URL}/api/archivist/clean`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INTERNAL_SERVICE_SECRET}`,
        },
        body: JSON.stringify({ account_ids: batchIds }),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.error(
          `[archivist-cron] Clean API returned ${response.status} for batch starting at index ${i}`
        );
        totalErrors += batchIds.length;
        continue;
      }

      // Response contains either a single result or { results: [...], accounts_processed }
      const result = await response.json();
      let resultCount: number;
      if (typeof result.accounts_processed === "number") {
        resultCount = result.accounts_processed;
      } else if (Array.isArray(result.results)) {
        resultCount = result.results.length;
      } else {
        resultCount = 1;
      }
      accountsProcessed += resultCount;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        console.error(
          `[archivist-cron] Clean API timed out after ${FETCH_TIMEOUT_MS}ms for batch starting at index ${i}`
        );
      } else {
        console.error(
          `[archivist-cron] Failed to call clean API for batch starting at index ${i}:`,
          err
        );
      }
      totalErrors += batchIds.length;
    } finally {
      clearTimeout(timer);
    }

    // Pause between batches to avoid overwhelming the endpoint
    if (i + API_BATCH_SIZE < allIds.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  // Log summary to ledger
  const { error: ledgerErr } = await admin.from("kinetiks_ledger").insert({
    account_id: null,
    event_type: "archivist_cron_run",
    source_operator: "archivist",
    detail: {
      accounts_queued: allIds.length,
      accounts_processed: accountsProcessed,
      errors: totalErrors,
      timestamp: new Date().toISOString(),
    },
  });
  if (ledgerErr) {
    console.error("[archivist-cron] Ledger insert failed:", ledgerErr);
  }

  const summary = {
    accounts_queued: allIds.length,
    accounts_processed: accountsProcessed,
    errors: totalErrors,
  };

  console.log("[archivist-cron] Run complete:", JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
