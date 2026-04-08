/**
 * POST /api/opportunities/refresh — re-run Scout v2 for the user.
 *
 * Phase 4 (build-plan §Phase 4). Until a scheduled job lands, this
 * is the user-initiated entry point that:
 *   1. Loads the operator profile
 *   2. Loads recent threads from `deskof_threads` (last 7 days)
 *   3. Computes recent reply cadence per community for duplicate-
 *      coverage detection
 *   4. Runs `runScout()`
 *   5. Inserts surfaced opportunities into `deskof_opportunities`
 *      (no-op upsert if the same thread is re-surfaced)
 *   6. Persists hard-filtered threads via `recordFilteredThreads`
 *
 * Returns the count of new opportunities + filtered rows so the
 * client can refresh the queue and the filtered-feed badge.
 *
 * Free tier still gets the same orchestration — the LLM enrichment
 * inside runScout is gated by `ANTHROPIC_API_KEY` presence at the
 * helper layer, and free-tier callers don't get suggested angles
 * because the gating happens in the UI (`<UpgradeGate>`), not here.
 */
import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { createDeskOfAdminClient } from "@/lib/supabase/admin";
import { getOperatorProfile } from "@/lib/cortex/operator-profile-service";
import { runScout } from "@/lib/scout/v1";
import { recordFilteredThreads } from "@/lib/opportunities/filtered";
import type { ThreadSnapshot } from "@kinetiks/deskof";

export const dynamic = "force-dynamic";

const RECENT_THREAD_DAYS = 7;
const RECENT_REPLY_DAYS = 7;
const MAX_THREADS = 100;

interface ThreadRow {
  id: string;
  platform: "reddit" | "quora";
  external_id: string;
  url: string;
  community: string;
  title: string;
  body: string | null;
  score: number;
  comment_count: number;
  thread_created_at: string;
  fetched_at: string;
  // Phase 4 velocity + enrichment columns (migration 00030).
  upvotes_per_hour: number | null;
  comments_per_hour: number | null;
  existing_reply_count: number | null;
  contains_question: boolean | null;
  mod_removal_rate: number | null;
}

function rowToSnapshot(row: ThreadRow): ThreadSnapshot {
  return {
    id: row.id,
    platform: row.platform,
    external_id: row.external_id,
    url: row.url,
    community: row.community,
    title: row.title,
    body: row.body,
    score: row.score,
    comment_count: row.comment_count,
    created_at: row.thread_created_at,
    fetched_at: row.fetched_at,
    upvotes_per_hour: row.upvotes_per_hour,
    comments_per_hour: row.comments_per_hour,
    existing_reply_count: row.existing_reply_count,
    contains_question: row.contains_question,
    mod_removal_rate: row.mod_removal_rate,
  };
}

export async function POST() {
  const auth = await requireDeskOfSession();
  if ("error" in auth) return auth.error;

  const supabase = createDeskOfServerClient();
  const admin = createDeskOfAdminClient();

  const profile = await getOperatorProfile(supabase, auth.session.user_id);
  if (!profile) {
    return NextResponse.json(
      { success: false, error: "Operator profile not found — finish onboarding first" },
      { status: 409 }
    );
  }

  // 1. Load recent threads (any platform). Bounded so a backfill
  //    can't blow the LLM enrichment budget.
  const since = new Date(
    Date.now() - RECENT_THREAD_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const { data: threadRows, error: threadErr } = await supabase
    .from("deskof_threads")
    .select(
      "id, platform, external_id, url, community, title, body, score, comment_count, thread_created_at, fetched_at, upvotes_per_hour, comments_per_hour, existing_reply_count, contains_question, mod_removal_rate"
    )
    .gte("thread_created_at", since)
    .order("thread_created_at", { ascending: false })
    .limit(MAX_THREADS);
  if (threadErr) {
    return NextResponse.json(
      { success: false, error: `thread fetch failed: ${threadErr.message}` },
      { status: 500 }
    );
  }
  const threads = (threadRows ?? []).map((r) => rowToSnapshot(r as ThreadRow));

  // 2. Last-7-day reply cadence per community for the duplicate-
  //    coverage anti-signal. Errors propagate — a silent empty map
  //    would mis-score the queue and hide DB / RLS regressions.
  const replySince = new Date(
    Date.now() - RECENT_REPLY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const { data: replyRows, error: replyErr } = await supabase
    .from("deskof_replies")
    .select("opportunity_id, posted_at")
    .eq("user_id", auth.session.user_id)
    .gte("posted_at", replySince);
  if (replyErr) {
    return NextResponse.json(
      { success: false, error: `reply cadence fetch failed: ${replyErr.message}` },
      { status: 500 }
    );
  }
  const recentByCommunity = new Map<string, number>();
  if (replyRows && replyRows.length > 0) {
    // Resolve community via join: cheaper to do a separate read
    // than to nest in the supabase select.
    const oppIds = (replyRows as Array<{ opportunity_id: string }>).map(
      (r) => r.opportunity_id
    );
    const { data: oppRows, error: oppErr } = await supabase
      .from("deskof_opportunities")
      .select("id, thread:deskof_threads!inner(community)")
      .in("id", oppIds);
    if (oppErr) {
      return NextResponse.json(
        {
          success: false,
          error: `opportunity lookup failed: ${oppErr.message}`,
        },
        { status: 500 }
      );
    }
    for (const row of (oppRows ?? []) as Array<{
      thread: { community: string } | { community: string }[] | null;
    }>) {
      const t = Array.isArray(row.thread) ? row.thread[0] : row.thread;
      if (!t) continue;
      recentByCommunity.set(
        t.community,
        (recentByCommunity.get(t.community) ?? 0) + 1
      );
    }
  }

  // 3. Run Scout v2.
  const result = await runScout(
    {
      threads,
      profile,
      recent_replies_by_community: recentByCommunity,
    },
    { limit: 20, llm_enrichment_top_n: 5 }
  );

  // 4. Persist surfaced opportunities idempotently.
  //
  // deskof_opportunities intentionally has NO unique constraint on
  // (user_id, thread_id) because re-surfacing an already-skipped or
  // expired thread is a first-class operation in the spec (the
  // "re-rank on refresh" story). That means a plain .insert() here
  // would duplicate pending rows on every refresh press.
  //
  // The idempotency rule we DO want: a refresh with the same thread
  // set should leave at most one pending row per (user, thread).
  // Delete any existing PENDING rows for the thread IDs we're about
  // to surface, then insert fresh. Skipped/expired rows stay as
  // historical records, which is what "re-surfacing is allowed"
  // preserves.
  if (result.surfaced.length > 0) {
    const oppRows = result.surfaced.map((entry) => ({
      user_id: auth.session.user_id,
      thread_id: entry.thread.id,
      match_score: entry.opportunity.match_score,
      match_breakdown: entry.opportunity.match_breakdown,
      suggested_angle: entry.opportunity.suggested_angle,
      expertise_tier_matched: entry.opportunity.expertise_tier_matched,
      opportunity_type: entry.opportunity.opportunity_type,
      status: entry.opportunity.status,
      surfaced_at: entry.opportunity.surfaced_at,
      expires_at: entry.opportunity.expires_at,
    }));
    const threadIds = result.surfaced.map((entry) => entry.thread.id);
    const { error: cleanupError } = await admin
      .from("deskof_opportunities")
      .delete()
      .eq("user_id", auth.session.user_id)
      .eq("status", "pending")
      .in("thread_id", threadIds);
    if (cleanupError) {
      return NextResponse.json(
        {
          success: false,
          error: `opportunity cleanup failed: ${cleanupError.message}`,
        },
        { status: 500 }
      );
    }
    const { error: insertError } = await admin
      .from("deskof_opportunities")
      .insert(oppRows);
    if (insertError) {
      return NextResponse.json(
        {
          success: false,
          error: `opportunity insert failed: ${insertError.message}`,
        },
        { status: 500 }
      );
    }
  }

  // 5. Persist hard-filtered threads. recordFilteredThreads is
  //    idempotent on (user_id, thread_id, filter_reason) thanks to
  //    migration 00029, so a re-run is a no-op.
  if (result.filtered.length > 0) {
    try {
      await recordFilteredThreads(
        admin,
        auth.session.user_id,
        result.filtered.map((f) => ({
          thread_id: f.thread.id,
          reason: f.reason,
          detail: f.detail,
          hypothetical_score: f.hypothetical_score,
        }))
      );
    } catch (err) {
      // Don't fail the refresh on filtered-row persistence errors —
      // the surfaced queue is the more important payload.
      // Log via the error message in the response so it's visible.
      const message = err instanceof Error ? err.message : "unknown";
      return NextResponse.json({
        success: true,
        surfaced_count: result.surfaced.length,
        filtered_count: 0,
        warning: `filtered persistence failed: ${message}`,
      });
    }
  }

  return NextResponse.json({
    success: true,
    surfaced_count: result.surfaced.length,
    filtered_count: result.filtered.length,
  });
}
