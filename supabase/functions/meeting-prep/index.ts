// supabase/functions/meeting-prep/index.ts
//
// Cadence: */15 * * * * (every 15 minutes — registered in
// migration 00078_comms_inbound_schedules.sql). Preps meetings
// starting 25-40 minutes out (comms spec §4.2: brief ~30 minutes
// before the meeting).
//
// Coordinator only (CLAUDE.md Lesson 7 — Deno/Node split). The prep
// generation + delivery runs in apps/id under Node via
// /api/internal/calendar/meeting-prep (Node-only: encrypted
// credential custody, @kinetiks/ai). This Deno function:
//   1. Queries kinetiks_connections for accounts with a live (active)
//      calendar system connection.
//   2. Batches up to PREP_BATCH_SIZE accounts per HTTP POST to apps/id
//      with the INTERNAL_SERVICE_SECRET bearer.
//   3. Logs per-batch outcomes; returns a coarse summary.

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PREP_BATCH_SIZE = 10;
const BATCH_FETCH_TIMEOUT_MS = 60_000;

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const internalSecret = Deno.env.get("INTERNAL_SERVICE_SECRET")!;
  const identityApiUrl = Deno.env.get("IDENTITY_API_URL") ?? "https://kinetiks.ai";

  if (!supabaseUrl || !supabaseServiceRoleKey || !internalSecret) {
    return new Response(JSON.stringify({ error: "missing_env" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data: rows, error } = await supabase
    .from("kinetiks_connections")
    .select("account_id")
    .eq("provider", "calendar")
    .eq("status", "active");
  if (error) {
    // Detail to the function logs only; the response body stays
    // generic (CR: no raw PostgREST text in responses).
    console.error("[meeting-prep] eligibility query failed:", error.message);
    return new Response(
      JSON.stringify({ error: "eligibility_query_failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const accountIds = [...new Set((rows ?? []).map((r) => r.account_id as string))];
  if (accountIds.length === 0) {
    return new Response(
      JSON.stringify({ accounts_eligible: 0, batches: 0, succeeded: 0, failed: 0 }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  let succeeded = 0;
  let failed = 0;
  let batches = 0;

  for (let i = 0; i < accountIds.length; i += PREP_BATCH_SIZE) {
    const batch = accountIds.slice(i, i + PREP_BATCH_SIZE);
    batches += 1;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BATCH_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`${identityApiUrl}/api/internal/calendar/meeting-prep`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${internalSecret}`,
        },
        body: JSON.stringify({
          accounts: batch.map((account_id) => ({ account_id })),
        }),
        signal: controller.signal,
      });
      // 207 = some accounts failed inside the batch; both count as
      // a delivered batch (the route captured the per-account detail).
      if (response.ok || response.status === 207) {
        succeeded += 1;
      } else {
        failed += 1;
        console.error(`[meeting-prep] batch ${batches} returned ${response.status}`);
      }
    } catch (err) {
      failed += 1;
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      console.error(
        `[meeting-prep] batch ${batches} ${isAbort ? "timed out" : "failed"}:`,
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return new Response(
    JSON.stringify({ accounts_eligible: accountIds.length, batches, succeeded, failed }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
