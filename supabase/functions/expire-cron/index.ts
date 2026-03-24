// Expiration Sweep CRON Edge Function
//
// Runs every hour. Expires stale and past-due proposals, marks
// superseded proposals. All operations are direct DB queries
// via the service role client - no API calls needed.
//
// Two types of expiration:
// 1. Explicit: proposals with expires_at in the past
// 2. Stale: submitted proposals unprocessed > 7 days
//
// Also marks older accepted proposals as superseded when a newer
// accepted proposal exists for the same account + layer.
//
// CRON schedule: every hour ("0 * * * *")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

/** Submitted proposals older than this are expired as stale. */
const STALE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Max proposals to process per sweep to avoid timeout. */
const BATCH_SIZE = 500;

Deno.serve(async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[expire-cron] Missing required environment variables");
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  // ── 1. Expire proposals with explicit expires_at in the past ──
  const { data: expiredExplicit, error: err1 } = await admin
    .from("kinetiks_proposals")
    .update({
      status: "expired",
      evaluated_at: now,
      evaluated_by: "cortex_expiration",
    })
    .in("status", ["submitted", "accepted"])
    .lt("expires_at", now)
    .not("expires_at", "is", null)
    .select("id, account_id, target_layer, source_app")
    .limit(BATCH_SIZE);

  if (err1) {
    console.error("[expire-cron] Explicit expiration query failed:", err1);
  }

  // ── 2. Expire stale unprocessed proposals (submitted > 7 days ago) ──
  const staleThreshold = new Date(
    Date.now() - STALE_WINDOW_MS
  ).toISOString();

  const { data: expiredStale, error: err2 } = await admin
    .from("kinetiks_proposals")
    .update({
      status: "expired",
      decline_reason: "stale_unprocessed",
      evaluated_at: now,
      evaluated_by: "cortex_expiration",
    })
    .eq("status", "submitted")
    .lt("submitted_at", staleThreshold)
    .select("id, account_id, target_layer, source_app")
    .limit(BATCH_SIZE);

  if (err2) {
    console.error("[expire-cron] Stale expiration query failed:", err2);
  }

  const allExpired = [
    ...(expiredExplicit ?? []),
    ...(expiredStale ?? []),
  ];

  // Log expirations to ledger
  if (allExpired.length > 0) {
    const ledgerEntries = allExpired.map((p) => ({
      account_id: p.account_id,
      event_type: "expiration",
      source_app: p.source_app,
      source_operator: "cortex",
      target_layer: p.target_layer,
      detail: { proposal_id: p.id },
    }));

    const { error: ledgerErr } = await admin
      .from("kinetiks_ledger")
      .insert(ledgerEntries);
    if (ledgerErr) {
      console.error("[expire-cron] Ledger insert failed:", ledgerErr);
    }
  }

  // ── 3. Mark superseded proposals ──
  // An accepted proposal is superseded if a newer accepted proposal
  // exists for the same account + layer.
  let supersededCount = 0;

  const { data: accepted } = await admin
    .from("kinetiks_proposals")
    .select("id, account_id, target_layer, evaluated_at")
    .eq("status", "accepted")
    .order("evaluated_at", { ascending: false })
    .limit(BATCH_SIZE);

  if (accepted && accepted.length > 0) {
    // Group by account+layer, keep newest, supersede the rest
    const groups = new Map<string, string[]>();
    for (const p of accepted) {
      const key = `${p.account_id}:${p.target_layer}`;
      const existing = groups.get(key) ?? [];
      existing.push(p.id as string);
      groups.set(key, existing);
    }

    const toSupersede: string[] = [];
    for (const ids of groups.values()) {
      if (ids.length > 1) {
        toSupersede.push(...ids.slice(1));
      }
    }

    if (toSupersede.length > 0) {
      const batch = toSupersede.slice(0, BATCH_SIZE);
      const { error: supersedErr } = await admin
        .from("kinetiks_proposals")
        .update({
          status: "superseded",
          evaluated_at: now,
          evaluated_by: "cortex_expiration",
        })
        .in("id", batch);

      if (supersedErr) {
        console.error("[expire-cron] Supersede update failed:", supersedErr);
      } else {
        supersededCount = batch.length;
      }
    }
  }

  // Log summary to ledger
  const { error: summaryLedgerErr } = await admin
    .from("kinetiks_ledger")
    .insert({
      account_id: null,
      event_type: "expire_cron_run",
      source_operator: "cortex",
      detail: {
        expired_explicit: (expiredExplicit ?? []).length,
        expired_stale: (expiredStale ?? []).length,
        superseded: supersededCount,
        timestamp: now,
      },
    });
  if (summaryLedgerErr) {
    console.error("[expire-cron] Summary ledger insert failed:", summaryLedgerErr);
  }

  const summary = {
    expired_explicit: (expiredExplicit ?? []).length,
    expired_stale: (expiredStale ?? []).length,
    superseded: supersededCount,
    total_expired: allExpired.length,
  };

  console.log("[expire-cron] Run complete:", JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
