// supabase/functions/email-poll/index.ts
//
// Cadence: */5 * * * * (every 5 minutes — registered in
// migration 00078_comms_inbound_schedules.sql), per the comms spec
// §2.2 polling mechanism.
//
// Coordinator only (CLAUDE.md Lesson 7 — Deno/Node split). The Gmail
// polling + intelligence pass runs in apps/id under Node via
// /api/internal/email/poll (Node-only: encrypted credential custody,
// @kinetiks/ai). This Deno function:
//   1. Queries kinetiks_connections for accounts with a live (active)
//      google_workspace system connection.
//   2. Batches up to POLL_BATCH_SIZE accounts per HTTP POST to apps/id
//      with the INTERNAL_SERVICE_SECRET bearer.
//   3. Logs per-batch outcomes; returns a coarse summary.

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const POLL_BATCH_SIZE = 10;
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
    .eq("provider", "google_workspace")
    .eq("status", "active");
  if (error) {
    return new Response(
      JSON.stringify({ error: `eligibility query failed: ${error.message}` }),
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

  for (let i = 0; i < accountIds.length; i += POLL_BATCH_SIZE) {
    const batch = accountIds.slice(i, i + POLL_BATCH_SIZE);
    batches += 1;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BATCH_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`${identityApiUrl}/api/internal/email/poll`, {
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
        console.error(`[email-poll] batch ${batches} returned ${response.status}`);
      }
    } catch (err) {
      failed += 1;
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      console.error(
        `[email-poll] batch ${batches} ${isAbort ? "timed out" : "failed"}:`,
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
