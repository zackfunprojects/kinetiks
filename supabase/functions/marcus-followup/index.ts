// Marcus Follow-up Delivery CRON Edge Function
//
// Runs every 5 minutes. Queries kinetiks_marcus_follow_ups for items
// that are due (delivered = false, scheduled_for <= now).
// Delivers as a new message in the original thread.
//
// CRON schedule: every 5 minutes ("*/5 * * * *")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[marcus-followup] Missing required environment variables");
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Find due follow-ups
  const { data: followUps, error } = await admin
    .from("kinetiks_marcus_follow_ups")
    .select("id, account_id, thread_id, message")
    .eq("delivered", false)
    .lte("scheduled_for", new Date().toISOString())
    .limit(50);

  if (error) {
    console.error("[marcus-followup] Failed to query follow-ups:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!followUps?.length) {
    return new Response(JSON.stringify({ delivered: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let delivered = 0;

  for (const followUp of followUps) {
    try {
      // Optimistic lock: mark as delivered first to prevent duplicate processing.
      // Only proceed if we actually updated a row (another CRON instance didn't get it first).
      const { count } = await admin
        .from("kinetiks_marcus_follow_ups")
        .update({ delivered: true }, { count: "exact" })
        .eq("id", followUp.id)
        .eq("delivered", false);

      if (!count || count === 0) {
        // Another instance already claimed this follow-up
        continue;
      }

      // Deliver the follow-up. If any step fails, revert the claim.
      try {
        // If there's a thread, add the follow-up as a Marcus message
        if (followUp.thread_id) {
          const { error: msgErr } = await admin.from("kinetiks_marcus_messages").insert({
            thread_id: followUp.thread_id,
            role: "marcus",
            content: followUp.message,
            channel: "web",
          });
          if (msgErr) throw new Error(`Message insert failed: ${msgErr.message}`);

          // Touch thread updated_at
          await admin
            .from("kinetiks_marcus_threads")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", followUp.thread_id);
        }

        // Create an alert for the follow-up
        const { error: alertErr } = await admin.from("kinetiks_marcus_alerts").insert({
          account_id: followUp.account_id,
          trigger_type: "gap",
          severity: "info",
          title: "Marcus follow-up",
          body: followUp.message,
        });
        if (alertErr) throw new Error(`Alert insert failed: ${alertErr.message}`);

        delivered++;
      } catch (deliveryErr) {
        // Revert the claim so the follow-up can be retried
        console.error(`[marcus-followup] Delivery failed for ${followUp.id}, reverting claim:`, deliveryErr);
        await admin
          .from("kinetiks_marcus_follow_ups")
          .update({ delivered: false }, { count: "exact" })
          .eq("id", followUp.id);
      }
    } catch (err) {
      console.error(`[marcus-followup] Failed to process follow-up ${followUp.id}:`, err);
    }
  }

  return new Response(JSON.stringify({ delivered }), {
    headers: { "Content-Type": "application/json" },
  });
});
