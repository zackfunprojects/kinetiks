// Marcus Monthly Review CRON Edge Function
//
// Runs every 15 minutes. Queries for monthly reviews that are due.
//
// CRON schedule: every 15 minutes ("*/15 * * * *")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const INTERNAL_SERVICE_SECRET = Deno.env.get("INTERNAL_SERVICE_SECRET");
const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://id.kinetiks.ai";

/**
 * Compute next monthly send time from the previous scheduled time.
 * Advances to the same day-of-month in the next month, handling
 * month-length differences (e.g. Jan 31 -> Feb 28).
 */
function computeNextMonthlySend(previousNextSendAt: string): string {
  const prev = new Date(previousNextSendAt);
  const next = new Date(prev);
  next.setMonth(next.getMonth() + 1);
  // If the day overflowed (e.g. Jan 31 -> Mar 3), clamp to last day of target month
  if (next.getDate() !== prev.getDate()) {
    next.setDate(0); // Go to last day of previous month (the one we wanted)
  }
  if (next.getTime() < Date.now()) {
    // If we're way behind, just schedule from now + ~30 days
    const fallback = new Date();
    fallback.setMonth(fallback.getMonth() + 1);
    return fallback.toISOString();
  }
  return next.toISOString();
}

Deno.serve(async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !INTERNAL_SERVICE_SECRET) {
    console.error("[marcus-monthly] Missing required environment variables");
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: schedules, error } = await admin
    .from("kinetiks_marcus_schedules")
    .select("id, account_id, schedule, timezone, channel, next_send_at")
    .eq("type", "monthly_review")
    .eq("enabled", true)
    .lte("next_send_at", new Date().toISOString());

  if (error) {
    console.error("[marcus-monthly] Failed to query schedules:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!schedules?.length) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let processed = 0;

  for (const schedule of schedules) {
    try {
      const response = await fetch(`${APP_URL}/api/marcus/brief`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INTERNAL_SERVICE_SECRET}`,
        },
        body: JSON.stringify({
          type: "monthly_review",
          account_id: schedule.account_id,
        }),
      });

      if (!response.ok) {
        console.error(`[marcus-monthly] Brief API returned ${response.status} for schedule ${schedule.id}`);
        continue;
      }

      const { content } = await response.json();
      const briefContent = content ?? "";

      // Deliver the brief
      if (briefContent && schedule.channel !== "email") {
        const { error: alertErr } = await admin.from("kinetiks_marcus_alerts").insert({
          account_id: schedule.account_id,
          trigger_type: "gap",
          severity: "info",
          title: "Monthly Review",
          body: briefContent,
          source_app: "marcus",
          delivered_via: [schedule.channel],
        });
        if (alertErr) {
          console.error(`[marcus-monthly] Alert insert failed for schedule ${schedule.id}:`, alertErr);
        }
      }

      const { error: ledgerErr } = await admin.from("kinetiks_ledger").insert({
        account_id: schedule.account_id,
        event_type: "marcus_monthly_review",
        source_operator: "marcus",
        detail: {
          brief_content_length: briefContent.length,
          channel: schedule.channel,
          delivered: briefContent.length > 0,
        },
      });
      if (ledgerErr) {
        console.error(`[marcus-monthly] Ledger insert failed for schedule ${schedule.id}:`, ledgerErr);
      }

      const nextSend = computeNextMonthlySend(schedule.next_send_at);
      const { error: updateErr } = await admin
        .from("kinetiks_marcus_schedules")
        .update({
          last_sent_at: new Date().toISOString(),
          next_send_at: nextSend,
        })
        .eq("id", schedule.id);
      if (updateErr) {
        console.error(`[marcus-monthly] Schedule update failed for ${schedule.id} (nextSend: ${nextSend}):`, updateErr);
      }

      processed++;
    } catch (err) {
      console.error(`[marcus-monthly] Failed to process schedule ${schedule.id}:`, err);
    }
  }

  return new Response(JSON.stringify({ processed }), {
    headers: { "Content-Type": "application/json" },
  });
});
