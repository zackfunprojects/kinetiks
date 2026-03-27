// Gmail Sync CRON Edge Function
//
// Syncs Gmail replies for all accounts with active Gmail connections.
// For each connected account, calls the Harvest inbox sync API endpoint
// to check for new replies, classify them, and update email records.
//
// CRON schedule: every 5 minutes ("*/5 * * * *")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const INTERNAL_SERVICE_SECRET = Deno.env.get("INTERNAL_SERVICE_SECRET");
const HARVEST_API_URL =
  Deno.env.get("HARVEST_API_URL") || "https://hv.kinetiks.ai";

/** Maximum accounts to sync in a single CRON run. */
const BATCH_LIMIT = 50;

/** Accounts to process per concurrent batch. */
const API_BATCH_SIZE = 5;

/** Timeout for each sync API call in milliseconds. */
const FETCH_TIMEOUT_MS = 30_000;

interface SyncResponse {
  success?: boolean;
  data?: {
    synced?: number;
    errors?: number;
  };
}

Deno.serve(async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !INTERNAL_SERVICE_SECRET) {
    console.error("[gmail-sync-cron] Missing required environment variables");
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Query accounts with active Gmail connections
  const { data: connections, error } = await admin
    .from("kinetiks_connections")
    .select("account_id")
    .eq("provider", "gmail")
    .eq("status", "active")
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[gmail-sync-cron] Failed to query connections:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!connections?.length) {
    return new Response(
      JSON.stringify({ processed: 0, message: "No active Gmail connections" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const accountIds = connections.map((c) => c.account_id as string);
  let totalSynced = 0;
  let totalErrors = 0;
  let totalProcessed = 0;

  // Process in batches of API_BATCH_SIZE
  for (let i = 0; i < accountIds.length; i += API_BATCH_SIZE) {
    const batch = accountIds.slice(i, i + API_BATCH_SIZE);

    const promises = batch.map(async (accountId) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(`${HARVEST_API_URL}/api/hv/inbox/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${INTERNAL_SERVICE_SECRET}`,
            "x-account-id": accountId,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          console.error(
            `[gmail-sync-cron] Sync API returned ${response.status} for account ${accountId}`
          );
          totalErrors++;
          return;
        }

        const result = (await response.json()) as SyncResponse;
        totalSynced += result.data?.synced ?? 0;
        totalErrors += result.data?.errors ?? 0;
        totalProcessed++;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          console.error(
            `[gmail-sync-cron] Sync API timed out after ${FETCH_TIMEOUT_MS}ms for account ${accountId}`
          );
        } else {
          console.error(
            `[gmail-sync-cron] Failed to call sync API for account ${accountId}:`,
            err
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
    total_synced: totalSynced,
    total_errors: totalErrors,
  };

  console.log("[gmail-sync-cron] Run complete:", JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
