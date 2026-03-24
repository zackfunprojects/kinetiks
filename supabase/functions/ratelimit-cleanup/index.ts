// Rate Limit Cleanup CRON Edge Function
//
// Runs daily. Deletes rate limit rows older than 2 days
// to prevent unbounded table growth.
//
// CRON schedule: once daily ("0 3 * * *")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase env vars" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  const { error, count } = await admin
    .from("kinetiks_rate_limits")
    .delete({ count: "exact" })
    .lt("window_start", twoDaysAgo.toISOString());

  if (error) {
    console.error("Rate limit cleanup failed:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log(`Rate limit cleanup: deleted ${count ?? 0} stale rows`);

  return new Response(
    JSON.stringify({ success: true, deleted: count ?? 0 }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
