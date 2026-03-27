// Sequence CRON Edge Function
//
// Processes active enrollments whose next step is due.
// Queries hv_enrollments for active enrollments with next_step_at <= now(),
// then calls the Harvest execute endpoint for each in batches.
//
// CRON schedule: every 60 seconds ("* * * * *")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const INTERNAL_SERVICE_SECRET = Deno.env.get("INTERNAL_SERVICE_SECRET");
const HARVEST_API_URL =
  Deno.env.get("HARVEST_API_URL") || "https://hv.kinetiks.ai";

/** Maximum enrollments to process in a single CRON run. */
const BATCH_LIMIT = 50;

/** Maximum enrollments per API call batch. */
const API_BATCH_SIZE = 10;

/** Timeout for each execute API call in milliseconds. */
const FETCH_TIMEOUT_MS = 30_000;

interface ExecuteResponse {
  success: boolean;
  data?: {
    enrollment_id: string;
    step_index: number;
    step_type: string;
    action: string;
    detail: string;
  };
  error?: string;
}

Deno.serve(async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !INTERNAL_SERVICE_SECRET) {
    console.error("[sequence-cron] Missing required environment variables");
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Fetch active enrollments whose next step is due
  const { data: enrollments, error } = await admin
    .from("hv_enrollments")
    .select("id")
    .eq("status", "active")
    .lte("next_step_at", new Date().toISOString())
    .order("next_step_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[sequence-cron] Failed to query enrollments:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!enrollments?.length) {
    return new Response(
      JSON.stringify({ processed: 0, message: "No pending enrollments" }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const allIds = enrollments.map((e) => e.id as string);
  let totalExecuted = 0;
  let totalErrors = 0;

  // Process in batches
  for (let i = 0; i < allIds.length; i += API_BATCH_SIZE) {
    const batchIds = allIds.slice(i, i + API_BATCH_SIZE);

    // Execute each enrollment in the batch sequentially
    for (const enrollmentId of batchIds) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(
          `${HARVEST_API_URL}/api/hv/sequences/execute`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${INTERNAL_SERVICE_SECRET}`,
            },
            body: JSON.stringify({ enrollment_id: enrollmentId }),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          console.error(
            `[sequence-cron] Execute API returned ${response.status} for enrollment ${enrollmentId}: ${body}`,
          );
          totalErrors++;
          continue;
        }

        const result = (await response.json()) as ExecuteResponse;
        if (result.success) {
          totalExecuted++;
        } else {
          console.error(
            `[sequence-cron] Execute failed for ${enrollmentId}: ${result.error}`,
          );
          totalErrors++;
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          console.error(
            `[sequence-cron] Execute API timed out after ${FETCH_TIMEOUT_MS}ms for enrollment ${enrollmentId}`,
          );
        } else {
          console.error(
            `[sequence-cron] Failed to call execute API for enrollment ${enrollmentId}:`,
            err,
          );
        }
        totalErrors++;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  const summary = {
    queued: allIds.length,
    executed: totalExecuted,
    errors: totalErrors,
  };

  console.log("[sequence-cron] Run complete:", JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
