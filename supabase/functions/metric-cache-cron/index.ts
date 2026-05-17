// metric-cache-cron Edge Function
//
// Periodic SWR refresh for kinetiks_metric_cache rows whose expires_at
// has passed. Runs every 15 minutes. The cadence + TTL table together
// keep traffic numbers within their freshness window per metric class:
//
//   ga4_sessions, ga4_users (rolling)           -> stale after 15 min
//   ga4_bounce_rate                              -> stale after 1 hour
//   any 90-day historical lookback               -> stale after 24 hours
//   D3 will add stripe, gsc rows the same way.
//
// IMPORTANT: this function runs under Deno. @google-analytics/data is
// Node-only, so the cron CANNOT hit GA4 directly. It calls the internal
// refresh route in apps/id (Node) which then runs the extractor and
// writes the cache row.
//
// Auth: shared Authorization: Bearer ${INTERNAL_SERVICE_SECRET} header.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const INTERNAL_SERVICE_SECRET = Deno.env.get("INTERNAL_SERVICE_SECRET");
const IDENTITY_API_URL =
  Deno.env.get("IDENTITY_API_URL") || "https://kinetiks.ai";

/** Maximum due rows pulled per CRON run. Keeps Edge Function within its budget. */
const BATCH_LIMIT = 100;

/** Concurrent refresh fan-out. */
const API_BATCH_SIZE = 5;

/** Timeout per internal refresh call. GA4 + Admin API are usually < 5s. */
const FETCH_TIMEOUT_MS = 20_000;

interface DueRow {
  account_id: string;
  source: string;
  normalized_input_hash: string;
}

interface RefreshResponse {
  ok?: boolean;
  status?: string;
  message?: string;
}

Deno.serve(async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !INTERNAL_SERVICE_SECRET) {
    console.error("[metric-cache-cron] Missing required environment variables");
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Pull due rows (expires_at <= now()). We order by oldest first so a
  // burst of new misses doesn't starve previously-stale rows.
  const { data: due, error } = await admin
    .from("kinetiks_metric_cache")
    .select("account_id, source, normalized_input_hash")
    .lte("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[metric-cache-cron] Failed to query due rows:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!due?.length) {
    return new Response(
      JSON.stringify({ processed: 0, message: "No due rows" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const rows = due as DueRow[];
  let refreshed = 0;
  let skipped = 0;
  let errored = 0;

  for (let i = 0; i < rows.length; i += API_BATCH_SIZE) {
    const batch = rows.slice(i, i + API_BATCH_SIZE);

    const promises = batch.map(async (row) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(
          `${IDENTITY_API_URL}/api/internal/metric-cache/refresh`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${INTERNAL_SERVICE_SECRET}`,
            },
            body: JSON.stringify({
              account_id: row.account_id,
              source: row.source,
              normalized_input_hash: row.normalized_input_hash,
            }),
            signal: controller.signal,
          }
        );

        const text = await response.text();
        let payload: RefreshResponse | null = null;
        try {
          payload = text ? (JSON.parse(text) as RefreshResponse) : null;
        } catch {
          payload = null;
        }

        if (!response.ok) {
          console.error(
            `[metric-cache-cron] refresh failed status=${response.status} account=${row.account_id} source=${row.source}: ${text}`
          );
          errored++;
          return;
        }

        if (payload?.status === "skipped") {
          skipped++;
        } else {
          refreshed++;
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          console.error(
            `[metric-cache-cron] refresh timed out after ${FETCH_TIMEOUT_MS}ms account=${row.account_id} source=${row.source}`
          );
        } else {
          console.error(
            `[metric-cache-cron] refresh threw account=${row.account_id} source=${row.source}:`,
            err
          );
        }
        errored++;
      } finally {
        clearTimeout(timer);
      }
    });

    await Promise.all(promises);
  }

  const summary = {
    due_rows: rows.length,
    refreshed,
    skipped,
    errored,
  };
  console.log("[metric-cache-cron] Run complete:", JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
