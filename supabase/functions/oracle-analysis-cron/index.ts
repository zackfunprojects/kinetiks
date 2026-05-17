// supabase/functions/oracle-analysis-cron/index.ts
//
// Cadence: */30 * * * * (every 30 minutes — registered in
// migration 00037_oracle_schedule_dedup_runs.sql).
//
// Coordinator only. The actual analysis runs in apps/id under Node, via
// /api/internal/oracle/analyze (Node-only because the runner imports
// from @kinetiks/ai, @nangohq/node, etc.). This Deno function:
//   1. Queries kinetiks_connections × kinetiks_metric_cache for accounts
//      that have at least one active connection AND a cache row
//      refreshed in the last 7 days.
//   2. Batches up to ANALYSIS_BATCH_SIZE accounts per HTTP POST to
//      apps/id with the INTERNAL_SERVICE_SECRET bearer.
//   3. Logs per-batch outcomes; returns a coarse summary.
//
// Per CLAUDE.md Lesson 7 — Deno/Node split.

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANALYSIS_BATCH_SIZE = 10;
const BATCH_FETCH_TIMEOUT_MS = 30_000;

interface EligibleAccount {
  account_id: string;
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const internalSecret = Deno.env.get("INTERNAL_SERVICE_SECRET")!;
  const identityApiUrl = Deno.env.get("IDENTITY_API_URL") ?? "https://kinetiks.ai";

  if (!supabaseUrl || !supabaseServiceRoleKey || !internalSecret) {
    return new Response(
      JSON.stringify({ error: "missing_env" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  // Eligibility query: distinct account_ids that have BOTH an active
  // connection AND a cache row refreshed in the last 7 days.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: connRows, error: connErr } = await supabase
    .from("kinetiks_connections")
    .select("account_id")
    .eq("status", "active");

  if (connErr) {
    return new Response(
      JSON.stringify({ error: "eligibility_query_failed", message: connErr.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const candidateAccountIds = Array.from(
    new Set((connRows ?? []).map((r) => r.account_id as string))
  );

  if (candidateAccountIds.length === 0) {
    return new Response(
      JSON.stringify({ accounts_eligible: 0, batches: 0, succeeded: 0, failed: 0 }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const { data: cacheRows, error: cacheErr } = await supabase
    .from("kinetiks_metric_cache")
    .select("account_id")
    .gte("refreshed_at", sevenDaysAgo)
    .in("account_id", candidateAccountIds);

  if (cacheErr) {
    return new Response(
      JSON.stringify({ error: "cache_query_failed", message: cacheErr.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const eligibleAccounts: EligibleAccount[] = Array.from(
    new Set((cacheRows ?? []).map((r) => r.account_id as string))
  ).map((id) => ({ account_id: id }));

  // Fan out
  let succeeded = 0;
  let failed = 0;
  const batches: number[] = [];
  for (let i = 0; i < eligibleAccounts.length; i += ANALYSIS_BATCH_SIZE) {
    const batch = eligibleAccounts.slice(i, i + ANALYSIS_BATCH_SIZE);
    try {
      const ok = await callAnalyzeRoute(identityApiUrl, internalSecret, batch);
      if (ok) succeeded += 1;
      else failed += 1;
      batches.push(batch.length);
    } catch (err) {
      failed += 1;
      console.error(
        `[oracle-analysis-cron] batch ${i / ANALYSIS_BATCH_SIZE} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return new Response(
    JSON.stringify({
      accounts_eligible: eligibleAccounts.length,
      batches: batches.length,
      succeeded,
      failed,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});

async function callAnalyzeRoute(
  identityApiUrl: string,
  internalSecret: string,
  batch: EligibleAccount[]
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BATCH_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${identityApiUrl}/api/internal/oracle/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalSecret}`,
      },
      body: JSON.stringify({ accounts: batch }),
      signal: controller.signal,
    });
    return response.ok;
  } finally {
    clearTimeout(timer);
  }
}
