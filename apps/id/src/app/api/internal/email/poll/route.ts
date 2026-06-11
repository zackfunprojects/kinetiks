/**
 * POST /api/internal/email/poll — Phase D4.
 *
 * Internal-only endpoint invoked by supabase/functions/email-poll
 * every 5 minutes (comms spec §2.2 polling cadence). The cron passes
 * a batch of account ids with live google_workspace connections;
 * this route fans them out to pollGmailInbox() with bounded
 * concurrency. Same Deno→Node split as oracle-analysis-cron
 * (Lesson 7) and the same shared-secret bearer posture.
 */

import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { serverEnv } from "@kinetiks/lib/env";

import { isValidInternalBearer } from "@/lib/auth/internal-bearer";
import { pollGmailInbox, type PollGmailResult } from "@/lib/email/receive";
import { captureException } from "@/lib/observability/sentry";

const Body = z.object({
  accounts: z
    .array(z.object({ account_id: z.string().uuid() }))
    .min(1)
    .max(50),
});

const ACCOUNT_CONCURRENCY = 3;

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
  const results: Array<{ account_id: string } & PollGmailResult> = [];

  async function worker(): Promise<void> {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      try {
        const outcome = await pollGmailInbox(next.account_id);
        results.push({ account_id: next.account_id, ...outcome });
      } catch (err) {
        await captureException(err, {
          tags: {
            route: "/api/internal/email/poll",
            action: "email.inbound",
            stage: "poll_account",
            app: "id",
          },
          user: { id: next.account_id },
          extra: {},
        });
        results.push({
          account_id: next.account_id,
          status: "failed",
          fetched: 0,
          processed: 0,
          relevant: 0,
          duplicates: 0,
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(ACCOUNT_CONCURRENCY, queue.length) }, () => worker()),
  );

  const failed = results.filter((r) => r.status === "failed").length;
  return NextResponse.json(
    { results, failed },
    { status: failed > 0 ? 207 : 200 },
  );
}
