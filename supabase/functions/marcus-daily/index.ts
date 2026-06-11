// Marcus Daily Brief CRON Edge Function
//
// Runs every 15 minutes. Queries kinetiks_marcus_schedules for daily briefs
// that are due (enabled, next_send_at <= now, type = 'daily_brief').
// For each: generates brief, delivers via configured channel, updates schedule.
//
// CRON schedule: every 15 minutes ("*/15 * * * *")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const INTERNAL_SERVICE_SECRET = Deno.env.get("INTERNAL_SERVICE_SECRET");
const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://id.kinetiks.ai";

/**
 * Compute next daily send time from the previous scheduled time (not Date.now())
 * to prevent drift. Adds exactly 24 hours to the original next_send_at.
 */
function computeNextDailySend(previousNextSendAt: string): string {
  const prev = new Date(previousNextSendAt);
  const next = new Date(prev.getTime() + 24 * 60 * 60 * 1000);
  // If the computed next time is already in the past (e.g. CRON was down),
  // advance to the next occurrence from now
  if (next.getTime() < Date.now()) {
    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }
  return next.toISOString();
}

Deno.serve(async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !INTERNAL_SERVICE_SECRET) {
    console.error("[marcus-daily] Missing required environment variables");
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Find daily briefs that are due
  const { data: schedules, error } = await admin
    .from("kinetiks_marcus_schedules")
    .select("id, account_id, schedule, timezone, channel, next_send_at")
    .eq("type", "daily_brief")
    .eq("enabled", true)
    .lte("next_send_at", new Date().toISOString());

  if (error) {
    console.error("[marcus-daily] Failed to query schedules:", error);
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
      // Generate brief via API
      const response = await fetch(`${APP_URL}/api/marcus/brief`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INTERNAL_SERVICE_SECRET}`,
        },
        body: JSON.stringify({
          type: "daily_brief",
          account_id: schedule.account_id,
          // D4: the route owns delivery (email / Slack DM / in-app
          // alert) and reports each leg honestly.
          deliver: true,
        }),
      });

      if (!response.ok) {
        console.error(`[marcus-daily] Brief API returned ${response.status} for schedule ${schedule.id}`);
        continue;
      }

      const payload = await response.json();
      const data = payload?.data ?? payload;
      const briefContent = data?.content ?? "";
      // Per-leg delivery report from the route (D4). Absent only if
      // the route predates deliver support; treat as nothing sent.
      const delivery = data?.delivery ?? null;
      const delivered = Boolean(
        delivery &&
          (delivery.email === "sent" ||
            delivery.slack === "sent" ||
            delivery.in_app === "created"),
      );


      // Log to ledger
      const { error: ledgerErr } = await admin.from("kinetiks_ledger").insert({
        account_id: schedule.account_id,
        event_type: "marcus_daily_brief",
        source_operator: "marcus",
        detail: {
          brief_content_length: briefContent.length,
          channel: schedule.channel,
          // D4: true only when a leg actually delivered (email sent,
          // Slack DM sent, or in-app alert created) - never "content
          // was generated".
          delivered,
          delivery,
        },
      });
      if (ledgerErr) {
        console.error(`[marcus-daily] Ledger insert failed for schedule ${schedule.id}:`, ledgerErr);
      }

      // Calculate next send from the scheduled time (not now) to prevent drift
      const nextSend = computeNextDailySend(schedule.next_send_at);
      const { error: updateErr } = await admin
        .from("kinetiks_marcus_schedules")
        .update({
          last_sent_at: new Date().toISOString(),
          next_send_at: nextSend,
        })
        .eq("id", schedule.id);
      if (updateErr) {
        console.error(`[marcus-daily] Schedule update failed for ${schedule.id} (nextSend: ${nextSend}):`, updateErr);
      }

      processed++;
    } catch (err) {
      console.error(`[marcus-daily] Failed to process schedule ${schedule.id}:`, err);
    }
  }

  return new Response(JSON.stringify({ processed }), {
    headers: { "Content-Type": "application/json" },
  });
});
