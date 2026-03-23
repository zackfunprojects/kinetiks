/**
 * Marcus Monthly Review CRON Edge Function
 *
 * Runs every 15 minutes. Queries for monthly reviews that are due.
 *
 * CRON schedule: every 15 minutes ("*/15 * * * *")
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SERVICE_SECRET = Deno.env.get("INTERNAL_SERVICE_SECRET")!;
const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://id.kinetiks.ai";

Deno.serve(async () => {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: schedules, error } = await admin
    .from("kinetiks_marcus_schedules")
    .select("id, account_id, schedule, timezone, channel")
    .eq("type", "monthly_review")
    .eq("enabled", true)
    .lte("next_send_at", new Date().toISOString());

  if (error || !schedules?.length) {
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

      if (!response.ok) continue;

      const { content } = await response.json();

      await admin.from("kinetiks_ledger").insert({
        account_id: schedule.account_id,
        event_type: "marcus_monthly_review",
        source_operator: "marcus",
        detail: { brief_content_length: content.length, channel: schedule.channel },
      });

      // Next send: ~30 days
      const nextSend = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await admin
        .from("kinetiks_marcus_schedules")
        .update({
          last_sent_at: new Date().toISOString(),
          next_send_at: nextSend,
        })
        .eq("id", schedule.id);

      processed++;
    } catch {
      // Continue
    }
  }

  return new Response(JSON.stringify({ processed }), {
    headers: { "Content-Type": "application/json" },
  });
});
