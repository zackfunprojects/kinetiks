/**
 * POST /api/internal/model-discovery/run
 *
 * Internal-only endpoint invoked by supabase/functions/model-discovery-cron
 * once a day. Polls the Anthropic Models API, and for any role whose
 * family has a strictly-newer model, raises an operator-only flip
 * proposal (detect → propose). It never changes the active mapping — the
 * flip happens only when the operator approves.
 *
 * Auth: shared-secret bearer (INTERNAL_SERVICE_SECRET), same posture as
 * /api/internal/oracle/analyze. No body required.
 */

import "server-only";

import { NextResponse } from "next/server";

import { isValidInternalBearer } from "@/lib/auth/internal-bearer";
import { captureException } from "@/lib/observability/sentry";
import { runModelDiscovery } from "@/lib/ai/model-discovery-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "missing_internal_secret" }, { status: 500 });
  }
  if (!isValidInternalBearer(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runModelDiscovery();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // The Models API read (or assignments read) failed — never act on a
    // partial picture. Surface to Sentry; return 502 so the cron logs a
    // visible failure rather than a silent no-op.
    await captureException(err, {
      tags: { route: "internal/model-discovery", action: "run", stage: "discovery", app: "id" },
      extra: {},
    });
    return NextResponse.json({ ok: false, error: "discovery_failed" }, { status: 502 });
  }
}
