/**
 * POST /api/internal/oracle/analyze
 *
 * Internal-only endpoint invoked by supabase/functions/oracle-analysis-cron
 * once every 30 minutes. The cron passes a batch of eligible account ids;
 * this route fans them out to analyzeAccount() with bounded per-account
 * concurrency.
 *
 * Auth: shared-secret bearer (INTERNAL_SERVICE_SECRET). Same posture as
 * /api/internal/metric-cache/refresh.
 */

import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { isValidInternalBearer } from "@/lib/auth/internal-bearer";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeAccount, type AnalyzeAccountResult } from "@/lib/oracle/runner";

const Body = z.object({
  accounts: z
    .array(z.object({ account_id: z.string().uuid() }))
    .min(1)
    .max(50),
});

const ACCOUNT_CONCURRENCY = 3;
const PER_ACCOUNT_TIMEOUT_MS = 25_000;

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

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: err instanceof Error ? err.message : "invalid JSON",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const results: AnalyzeAccountResult[] = await runWithConcurrency(
    parsed.accounts,
    ACCOUNT_CONCURRENCY,
    async ({ account_id }) => analyzeWithTimeout(admin, account_id)
  );

  return NextResponse.json({
    ok: true,
    processed: results.length,
    summary: summarize(results),
    results: results.map((r) => ({
      account_id: r.account_id,
      status: r.status,
      reason: r.reason,
      duration_ms: r.duration_ms,
      insights_written: r.counts.insights_written,
      insights_deduped: r.counts.insights_deduped,
      signals_total: r.counts.signals_total,
    })),
  });
}

async function analyzeWithTimeout(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string
): Promise<AnalyzeAccountResult> {
  return Promise.race([
    analyzeAccount(admin, accountId),
    new Promise<AnalyzeAccountResult>((resolve) =>
      setTimeout(
        () =>
          resolve({
            account_id: accountId,
            status: "errored",
            reason: "per_account_timeout",
            counts: {
              signals_total: 0,
              signals_by_type: {},
              insights_written: 0,
              insights_deduped: 0,
              proposals_emitted: 0,
              haiku_tokens_in: 0,
              haiku_tokens_out: 0,
            },
            duration_ms: PER_ACCOUNT_TIMEOUT_MS,
            sources_evaluated: [],
          }),
        PER_ACCOUNT_TIMEOUT_MS
      )
    ),
  ]);
}

function summarize(results: AnalyzeAccountResult[]): Record<string, number> {
  const out: Record<string, number> = {
    succeeded: 0,
    skipped: 0,
    errored: 0,
    total_insights_written: 0,
    total_signals: 0,
  };
  for (const r of results) {
    out[r.status]! += 1;
    out.total_insights_written! += r.counts.insights_written;
    out.total_signals! += r.counts.signals_total;
  }
  return out;
}

/**
 * Inline semaphore. Avoids adding p-limit when we only need it once.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers: Promise<void>[] = [];

  for (let w = 0; w < Math.min(concurrency, items.length); w++) {
    workers.push(
      (async () => {
        while (true) {
          const idx = nextIndex++;
          if (idx >= items.length) return;
          results[idx] = await fn(items[idx]!);
        }
      })()
    );
  }

  await Promise.all(workers);
  return results;
}
