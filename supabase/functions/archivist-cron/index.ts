// Archivist CRON Edge Function
//
// Runs every 6 hours. Used to make four sequential POSTs per account
// batch to /api/archivist/clean, /api/archivist/patterns/sweep,
// /api/archivist/patterns/sweep-deferred, and (on the 00:00 UTC tick)
// /api/archivist/patterns/calibrate.
//
// Phase 3 — the cron now calls a single Workflow-runner route per
// account batch:
//
//   POST /api/internal/workflows/archivist-maintenance/run
//        body: { account_ids: string[] }
//
// The Node-side runner dispatches the four-step
// `kinetiks_id.archivist_maintenance` Workflow through
// `@kinetiks/runtime`'s Workflow dispatcher, which writes per-task
// Ledger entries (`workflow_task_dispatched` + `workflow_task_completed`
// / `workflow_task_failed`). The runner's response includes an
// `archivist_cron_summary` block in the same shape this function used
// to build itself; we read those counts and continue to write the
// existing `archivist_cron_run` Ledger summary so any downstream
// dashboards keep working.
//
// The four original /api/archivist/* routes remain in place for
// customer-direct calls; this cron simply no longer drives them.
//
// CRON schedule: every 6 hours ("0 */6 * * *")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const INTERNAL_SERVICE_SECRET = Deno.env.get("INTERNAL_SERVICE_SECRET");
const APP_URL =
  Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://id.kinetiks.ai";

/** Maximum accounts to process per CRON run. */
const ACCOUNT_LIMIT = 200;

/** Accounts per workflow-runner call. */
const API_BATCH_SIZE = 5;

/** Timeout for each workflow-runner call in milliseconds. */
const FETCH_TIMEOUT_MS = 60_000;

/** Delay between batches in milliseconds to avoid overwhelming the endpoint. */
const BATCH_DELAY_MS = 2_000;

interface ArchivistCronSummaryBatch {
  accounts_queued?: number;
  accounts_processed?: number;
  errors?: number;
  pattern_sweep_processed?: number;
  pattern_sweep_errors?: number;
  deferred_sweep_processed?: number;
  deferred_sweep_errors?: number;
  calibration_processed?: number;
  calibration_errors?: number;
}

Deno.serve(async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !INTERNAL_SERVICE_SECRET) {
    console.error("[archivist-cron] Missing required environment variables");
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Get all onboarded accounts
  const { data: accounts, error: accountsErr } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("onboarding_complete", true)
    .limit(ACCOUNT_LIMIT);

  if (accountsErr) {
    console.error("[archivist-cron] Failed to query accounts:", accountsErr);
    return new Response(JSON.stringify({ error: accountsErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!accounts?.length) {
    return new Response(
      JSON.stringify({ processed: 0, message: "No accounts to audit" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const allIds = accounts.map((a) => a.id as string);

  // Per-step rollups across all batches, matching the legacy summary
  // shape so anything reading the `archivist_cron_run` Ledger detail
  // continues to find the same keys.
  let accountsProcessed = 0;
  let totalErrors = 0;
  let patternSweepProcessed = 0;
  let patternSweepErrors = 0;
  let deferredSweepProcessed = 0;
  let deferredSweepErrors = 0;
  let calibrationProcessed = 0;
  let calibrationErrors = 0;
  const isCalibrationTick = new Date().getUTCHours() === 0;

  async function postWorkflowRun(
    batchIds: string[],
  ): Promise<{ ok: boolean; summary: ArchivistCronSummaryBatch | null }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${APP_URL}/api/internal/workflows/archivist-maintenance/run`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${INTERNAL_SERVICE_SECRET}`,
          },
          body: JSON.stringify({ account_ids: batchIds }),
          signal: controller.signal,
        },
      );
      // 207 (Multi-Status) means the workflow ran but at least one
      // step failed; we still want the per-step counts so we treat
      // both 200 and 207 as "transport ok" and rely on the summary's
      // own error fields for accounting.
      if (response.status !== 200 && response.status !== 207) {
        console.error(
          `[archivist-cron] workflow run returned status ${response.status} for batch ${batchIds.join(",")}`,
        );
        return { ok: false, summary: null };
      }
      const json = (await response.json()) as {
        archivist_cron_summary?: ArchivistCronSummaryBatch;
      };
      return { ok: true, summary: json?.archivist_cron_summary ?? null };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        console.error(
          `[archivist-cron] workflow run timed out after ${FETCH_TIMEOUT_MS}ms for batch ${batchIds.join(",")}`,
        );
      } else {
        console.error(`[archivist-cron] workflow run failed:`, err);
      }
      return { ok: false, summary: null };
    } finally {
      clearTimeout(timer);
    }
  }

  for (let i = 0; i < allIds.length; i += API_BATCH_SIZE) {
    const batchIds = allIds.slice(i, i + API_BATCH_SIZE);
    const { ok, summary } = await postWorkflowRun(batchIds);

    if (!ok || !summary) {
      // Transport-level failure: every account in this batch counts
      // as an error for the legacy `errors` field, matching the old
      // cron's behaviour when a single route POST failed wholesale.
      totalErrors += batchIds.length;
    } else {
      accountsProcessed += summary.accounts_processed ?? 0;
      totalErrors += summary.errors ?? 0;
      patternSweepProcessed += summary.pattern_sweep_processed ?? 0;
      patternSweepErrors += summary.pattern_sweep_errors ?? 0;
      deferredSweepProcessed += summary.deferred_sweep_processed ?? 0;
      deferredSweepErrors += summary.deferred_sweep_errors ?? 0;
      // Calibration counts only appear when the workflow actually ran
      // the calibrate step (the runner omits them on the
      // `skipped: true` no-op tick).
      if (typeof summary.calibration_processed === "number") {
        calibrationProcessed += summary.calibration_processed;
      }
      if (typeof summary.calibration_errors === "number") {
        calibrationErrors += summary.calibration_errors;
      }
    }

    if (i + API_BATCH_SIZE < allIds.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  // Log summary to ledger — same shape and key set as the legacy
  // cron, so downstream consumers don't break.
  const { error: ledgerErr } = await admin.from("kinetiks_ledger").insert({
    account_id: null,
    event_type: "archivist_cron_run",
    source_operator: "archivist",
    detail: {
      accounts_queued: allIds.length,
      accounts_processed: accountsProcessed,
      errors: totalErrors,
      pattern_sweep_processed: patternSweepProcessed,
      pattern_sweep_errors: patternSweepErrors,
      deferred_sweep_processed: deferredSweepProcessed,
      deferred_sweep_errors: deferredSweepErrors,
      ...(isCalibrationTick
        ? {
            calibration_processed: calibrationProcessed,
            calibration_errors: calibrationErrors,
          }
        : {}),
      timestamp: new Date().toISOString(),
    },
  });
  if (ledgerErr) {
    console.error("[archivist-cron] Ledger insert failed:", ledgerErr);
  }

  const summary = {
    accounts_queued: allIds.length,
    accounts_processed: accountsProcessed,
    errors: totalErrors,
    pattern_sweep_processed: patternSweepProcessed,
    pattern_sweep_errors: patternSweepErrors,
    deferred_sweep_processed: deferredSweepProcessed,
    deferred_sweep_errors: deferredSweepErrors,
    ...(isCalibrationTick
      ? {
          calibration_processed: calibrationProcessed,
          calibration_errors: calibrationErrors,
        }
      : {}),
  };

  console.log("[archivist-cron] Run complete:", JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
