/**
 * POST /api/internal/calendar/meeting-prep — Phase D4.
 *
 * Internal-only endpoint invoked by supabase/functions/meeting-prep
 * every 15 minutes. The cron passes account ids with live `calendar`
 * connections; this route runs the prep window for each (comms spec
 * §4.2: brief ~30 minutes before the meeting). Same Deno→Node split
 * and bearer posture as oracle-analysis-cron.
 */

import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { serverEnv } from "@kinetiks/lib/env";

import { isValidInternalBearer } from "@/lib/auth/internal-bearer";
import { runMeetingPrep, type MeetingPrepResult } from "@/lib/calendar/prep";
import { captureException } from "@/lib/observability/sentry";

const Body = z.object({
  accounts: z
    .array(z.object({ account_id: z.string().uuid() }))
    .min(1)
    .max(50),
});

const ACCOUNT_CONCURRENCY = 2;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = serverEnv().INTERNAL_SERVICE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "missing_internal_secret" }, { status: 500 });
  }
  if (!isValidInternalBearer(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const queue = [...parsed.accounts];
  type AccountOutcome = { account_id: string; status: MeetingPrepResult["status"] | "failed" } & Partial<
    Omit<MeetingPrepResult, "status">
  >;
  const results: AccountOutcome[] = [];

  async function worker(): Promise<void> {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      try {
        const outcome = await runMeetingPrep(next.account_id);
        results.push({ account_id: next.account_id, ...outcome });
      } catch (err) {
        await captureException(err, {
          tags: {
            route: "/api/internal/calendar/meeting-prep",
            action: "calendar.prep",
            stage: "run_account",
            app: "id",
          },
          user: { id: next.account_id },
          extra: {},
        });
        results.push({ account_id: next.account_id, status: "failed" });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(ACCOUNT_CONCURRENCY, queue.length) }, () => worker()),
  );

  const failed = results.filter((r) => r.status === "failed").length;
  return NextResponse.json({ results, failed }, { status: failed > 0 ? 207 : 200 });
}
