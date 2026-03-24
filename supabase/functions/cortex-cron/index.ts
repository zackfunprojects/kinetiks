// Cortex CRON Edge Function
//
// Processes the proposal queue. Queries kinetiks_proposals for all
// "submitted" proposals, sends them in batches to /api/cortex/evaluate.
//
// CRON schedule: every 60 seconds ("* * * * *")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const INTERNAL_SERVICE_SECRET = Deno.env.get("INTERNAL_SERVICE_SECRET");
const APP_URL =
  Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://id.kinetiks.ai";

/** Maximum proposals to evaluate in a single CRON run. */
const BATCH_LIMIT = 50;

/** Maximum proposals per API call (to avoid huge payloads). */
const API_BATCH_SIZE = 10;

/** Timeout for each evaluate API call in milliseconds. */
const FETCH_TIMEOUT_MS = 30_000;

interface EvaluateResponse {
  evaluated?: number;
  accepted?: number;
  declined?: number;
  escalated?: number;
  errors?: number;
}

Deno.serve(async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !INTERNAL_SERVICE_SECRET) {
    console.error("[cortex-cron] Missing required environment variables");
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Fetch submitted proposals ordered by submission time (oldest first)
  const { data: proposals, error } = await admin
    .from("kinetiks_proposals")
    .select("id")
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[cortex-cron] Failed to query proposals:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!proposals?.length) {
    return new Response(
      JSON.stringify({ processed: 0, message: "No pending proposals" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const allIds = proposals.map((p) => p.id as string);
  let totalEvaluated = 0;
  let totalAccepted = 0;
  let totalDeclined = 0;
  let totalEscalated = 0;
  let totalErrors = 0;

  // Process in batches
  for (let i = 0; i < allIds.length; i += API_BATCH_SIZE) {
    const batchIds = allIds.slice(i, i + API_BATCH_SIZE);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(`${APP_URL}/api/cortex/evaluate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INTERNAL_SERVICE_SECRET}`,
        },
        body: JSON.stringify({ proposal_ids: batchIds }),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.error(
          `[cortex-cron] Evaluate API returned ${response.status} for batch starting at index ${i}`
        );
        totalErrors += batchIds.length;
        continue;
      }

      const result = (await response.json()) as EvaluateResponse;
      totalEvaluated += result.evaluated ?? 0;
      totalAccepted += result.accepted ?? 0;
      totalDeclined += result.declined ?? 0;
      totalEscalated += result.escalated ?? 0;
      totalErrors += result.errors ?? 0;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        console.error(
          `[cortex-cron] Evaluate API timed out after ${FETCH_TIMEOUT_MS}ms for batch starting at index ${i}`
        );
      } else {
        console.error(
          `[cortex-cron] Failed to call evaluate API for batch starting at index ${i}:`,
          err
        );
      }
      totalErrors += batchIds.length;
    } finally {
      clearTimeout(timer);
    }
  }

  // Log to ledger
  const { error: ledgerErr } = await admin.from("kinetiks_ledger").insert({
    account_id: null,
    event_type: "cortex_cron_run",
    source_operator: "cortex",
    detail: {
      queued: allIds.length,
      evaluated: totalEvaluated,
      accepted: totalAccepted,
      declined: totalDeclined,
      escalated: totalEscalated,
      errors: totalErrors,
      timestamp: new Date().toISOString(),
    },
  });
  if (ledgerErr) {
    console.error("[cortex-cron] Ledger insert failed:", ledgerErr);
  }

  const summary = {
    queued: allIds.length,
    evaluated: totalEvaluated,
    accepted: totalAccepted,
    declined: totalDeclined,
    escalated: totalEscalated,
    errors: totalErrors,
  };

  console.log("[cortex-cron] Run complete:", JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
