/**
 * Marcus Follow-up Delivery CRON Edge Function
 *
 * Runs every 5 minutes. Queries kinetiks_marcus_follow_ups for items
 * that are due (delivered = false, scheduled_for <= now).
 * Delivers as a new message in the original thread.
 *
 * CRON schedule: every 5 minutes ("*/5 * * * *")
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async () => {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Find due follow-ups
  const { data: followUps, error } = await admin
    .from("kinetiks_marcus_follow_ups")
    .select("id, account_id, thread_id, message")
    .eq("delivered", false)
    .lte("scheduled_for", new Date().toISOString())
    .limit(50);

  if (error || !followUps?.length) {
    return new Response(JSON.stringify({ delivered: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let delivered = 0;

  for (const followUp of followUps) {
    try {
      // If there's a thread, add the follow-up as a Marcus message
      if (followUp.thread_id) {
        await admin.from("kinetiks_marcus_messages").insert({
          thread_id: followUp.thread_id,
          role: "marcus",
          content: followUp.message,
          channel: "web",
        });

        // Touch thread updated_at
        await admin
          .from("kinetiks_marcus_threads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", followUp.thread_id);
      }

      // Create an alert for the follow-up
      await admin.from("kinetiks_marcus_alerts").insert({
        account_id: followUp.account_id,
        trigger_type: "gap",
        severity: "info",
        title: "Marcus follow-up",
        body: followUp.message,
      });

      // Mark as delivered
      await admin
        .from("kinetiks_marcus_follow_ups")
        .update({ delivered: true })
        .eq("id", followUp.id);

      delivered++;
    } catch {
      // Continue processing other follow-ups
    }
  }

  return new Response(JSON.stringify({ delivered }), {
    headers: { "Content-Type": "application/json" },
  });
});
