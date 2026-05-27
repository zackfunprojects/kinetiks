/**
 * POST /api/internal/workflows/archivist-maintenance/run
 *
 * Phase 3 — first internal Operator Workflow in production. Invoked
 * once per account batch by `supabase/functions/archivist-cron`,
 * replacing the four sequential POSTs the cron used to make to
 * `/api/archivist/clean`, `/api/archivist/patterns/sweep`,
 * `/api/archivist/patterns/sweep-deferred`, and
 * `/api/archivist/patterns/calibrate`. Those four routes still exist
 * and remain the customer-direct path; this route is the
 * Workflow-dispatched path used by the cron.
 *
 * Auth: shared-secret bearer (INTERNAL_SERVICE_SECRET). Same posture
 * as `/api/internal/oracle/analyze` and `/api/internal/metric-cache/refresh`.
 *
 * Body: `{ account_ids: string[] }` — same shape the legacy four
 * routes accepted.
 *
 * Response: the `WorkflowRunSummary` returned by `runWorkflow`,
 * augmented with `archivist_cron_summary` so the Deno cron can derive
 * the same per-step counts it used to write to the
 * `archivist_cron_run` Ledger entry.
 */

import "server-only";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@kinetiks/lib/env";

import { runWorkflow, type DispatchDeps } from "@kinetiks/runtime";
import type {
  WorkflowDispatchContext,
  WorkflowRunSummary,
  WorkflowTaskResult,
} from "@kinetiks/types";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveKinetiksOperator } from "@/lib/operators/registry-boot";
import { archivistMaintenance } from "@/lib/workflows/archivist-maintenance";

const Body = z.object({
  // Fail fast at the boundary — an empty batch always means an upstream
  // caller bug (the cron only POSTs when it has accounts queued), and a
  // workflow run with zero work returns a misleading "ok" summary.
  account_ids: z.array(z.string().uuid()).min(1),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Use the Zod-validated env loader so a missing INTERNAL_SERVICE_SECRET
  // is a startup-time failure, not a first-request 500.
  const { INTERNAL_SERVICE_SECRET: secret } = serverEnv();
  if (!secret) {
    return NextResponse.json(
      { error: "missing_internal_secret" },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: err instanceof Error ? err.message : "invalid JSON",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const correlationId = randomUUID();

  const ctx: WorkflowDispatchContext = {
    account_id: null, // batch run — no single account scope
    correlation_id: correlationId,
    invoked_by: "cron:archivist-maintenance",
    team_scope_id: null,
    metadata: { account_ids: parsed.account_ids },
  };

  const deps: DispatchDeps = {
    resolveOperator: resolveKinetiksOperator,
    insertRoutingEvent: async (row) => {
      // Phase 3's archivist-maintenance workflow is internal-only, so
      // this branch is not exercised by the production cron path. It
      // is wired here so the dispatcher's `cross_app` path is
      // available to ad-hoc callers and so the production deps shape
      // matches what tests assert.
      const { error } = await admin.from("kinetiks_routing_events").insert({
        account_id: row.account_id,
        target_app: row.target_app,
        payload: row.payload,
        relevance_note: row.relevance_note,
      });
      if (error) throw new Error(`routing event insert failed: ${error.message}`);
    },
    writeLedger: async (entry) => {
      // Best-effort — the dispatcher swallows failures here so a
      // Ledger blip never halts a Workflow run, but we still propagate
      // the error to the dispatcher so it can console.error with
      // context. Sentry capture happens at the dispatcher layer if/when
      // we wire it; for now Ledger errors are visible in dev logs.
      const { error } = await admin.from("kinetiks_ledger").insert({
        account_id: entry.account_id,
        event_type: entry.event_type,
        source_app: "kinetiks_id",
        source_operator: entry.source_operator,
        target_layer: null,
        detail: entry.detail,
      });
      if (error) {
        throw new Error(
          `ledger insert failed (${entry.event_type}): ${error.message}`,
        );
      }
    },
  };

  const summary: WorkflowRunSummary = await runWorkflow(
    archivistMaintenance,
    ctx,
    deps,
  );

  // Roll up per-step outputs into the shape the Deno cron previously
  // computed across four separate route responses. The cron writes
  // its existing `archivist_cron_run` Ledger summary from this block,
  // preserving the existing log shape (and any downstream dashboards).
  const archivist_cron_summary = buildArchivistCronSummary(summary, parsed.account_ids.length);

  return NextResponse.json(
    {
      summary,
      archivist_cron_summary,
    },
    { status: summary.ok ? 200 : 207 }, // 207 Multi-Status: partial success
  );
}

interface ArchivistCronSummary {
  accounts_queued: number;
  accounts_processed: number;
  errors: number;
  pattern_sweep_processed: number;
  pattern_sweep_errors: number;
  deferred_sweep_processed: number;
  deferred_sweep_errors: number;
  /** Present only when the calibrate step ran (00:00 UTC tick). */
  calibration_processed?: number;
  calibration_errors?: number;
}

function buildArchivistCronSummary(
  summary: WorkflowRunSummary,
  queued: number,
): ArchivistCronSummary {
  const byKey = new Map<string, WorkflowTaskResult>(
    summary.tasks.map((t: WorkflowTaskResult) => [t.task_key, t] as const),
  );
  const out = (key: string): Record<string, unknown> => {
    const t = byKey.get(key);
    return (t?.output ?? {}) as Record<string, unknown>;
  };

  const cleanOut = out("clean");
  const sweepOut = out("sweep");
  const deferredOut = out("sweep_deferred");
  const calibrateOut = out("calibrate");

  const summaryOut: ArchivistCronSummary = {
    accounts_queued: queued,
    accounts_processed: numberOr(cleanOut["accounts_processed"], 0),
    errors: numberOr(cleanOut["errors"], 0),
    pattern_sweep_processed: numberOr(sweepOut["accounts_processed"], 0),
    pattern_sweep_errors: numberOr(sweepOut["errors"], 0),
    deferred_sweep_processed: numberOr(deferredOut["accounts_processed"], 0),
    deferred_sweep_errors: numberOr(deferredOut["errors"], 0),
  };

  // Calibration ran only when the executor did NOT short-circuit on
  // `only_at_utc_hour`. The skipped output sets `skipped: true`.
  if (calibrateOut["skipped"] !== true) {
    summaryOut.calibration_processed = numberOr(calibrateOut["accounts_processed"], 0);
    summaryOut.calibration_errors = numberOr(calibrateOut["errors"], 0);
  }

  return summaryOut;
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : fallback;
}
