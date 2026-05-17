// Archivist CRON Edge Function
//
// Runs every 6 hours. Two passes per onboarded account:
//   1. /api/archivist/clean — deduplication, normalization, gap detection,
//      quality scoring on Cortex context layers.
//   2. /api/archivist/patterns/sweep (L1a, per 2027 addendum §1.9) —
//      time-based Pattern Library decay: validated → declining when
//      now - last_observed_at > effective_decay_days * 0.7, and
//      declining → archived when now > decay_at. User-starred patterns
//      are exempt.
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
  let patternSweepProcessed = 0;
  let patternSweepErrors = 0;

  // Helper: POST to an internal endpoint with timeout + service auth.
  async function postInternal(path: string, batchIds: string[]): Promise<{ ok: boolean; body: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`${APP_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INTERNAL_SERVICE_SECRET}`,
        },
        body: JSON.stringify({ account_ids: batchIds }),
        signal: controller.signal,
      });
      if (!response.ok) return { ok: false, body: { status: response.status } };
      const json = await response.json();
      return { ok: true, body: json };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        console.error(`[archivist-cron] ${path} timed out after ${FETCH_TIMEOUT_MS}ms`);
      } else {
        console.error(`[archivist-cron] ${path} failed:`, err);
      }
      return { ok: false, body: { error: String(err) } };
    } finally {
      clearTimeout(timer);
    }
  }

  // Pass 1: clean Cortex layers. Process in batches.
  for (let i = 0; i < allIds.length; i += API_BATCH_SIZE) {
    const batchIds = allIds.slice(i, i + API_BATCH_SIZE);
    const { ok, body } = await postInternal("/api/archivist/clean", batchIds);
    if (!ok) {
      totalErrors += batchIds.length;
    } else {
      const result = body as { accounts_processed?: number; results?: unknown[] };
      let resultCount: number;
      if (typeof result.accounts_processed === "number") {
        resultCount = result.accounts_processed;
      } else if (Array.isArray(result.results)) {
        resultCount = result.results.length;
      } else {
        resultCount = 1;
      }
      accountsProcessed += resultCount;
    }

    if (i + API_BATCH_SIZE < allIds.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  // Pass 2: Pattern Library time-decay sweep. Same batching, same auth.
  for (let i = 0; i < allIds.length; i += API_BATCH_SIZE) {
    const batchIds = allIds.slice(i, i + API_BATCH_SIZE);
    const { ok, body } = await postInternal("/api/archivist/patterns/sweep", batchIds);
    if (!ok) {
      patternSweepErrors += batchIds.length;
    } else {
      const env = body as { data?: { accounts_processed?: number } };
      const count =
        typeof env?.data?.accounts_processed === "number"
          ? env.data.accounts_processed
          : batchIds.length;
      patternSweepProcessed += count;
    }
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
      pattern_sweep_processed: patternSweepProcessed,
      pattern_sweep_errors: patternSweepErrors,
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
    pattern_sweep_processed: patternSweepProcessed,
    pattern_sweep_errors: patternSweepErrors,
  };

  console.log("[archivist-cron] Run complete:", JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
