/**
 * Filtered-thread repository (build-plan §4.7, Quality Addendum #7).
 *
 * Reads + writes `deskof_filtered_threads`. The filtered feed is a
 * read-only "review what Scout dropped today" surface — daily reset,
 * non-persistent across days for the user's view, though the rows
 * persist for Pulse / Mirror calibration learning.
 *
 * Free tier: counter only (still queryable; UI gates the sheet).
 * Standard+: counter + tappable list with reasons.
 * Hero: digest summary email (out of scope for this PR).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FilterReason, ThreadSnapshot } from "@kinetiks/deskof";

export interface FilteredThread {
  id: string;
  thread: ThreadSnapshot;
  reason: FilterReason;
  detail: string;
  hypothetical_score: number;
  filtered_at: string;
}

interface FilteredRow {
  id: string;
  thread_id: string;
  filter_reason: FilterReason;
  reason_detail: string | null;
  hypothetical_score: number;
  filtered_at: string;
  thread: ThreadRow | ThreadRow[] | null;
}

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
}

function rowToFiltered(row: FilteredRow): FilteredThread | null {
  const t = Array.isArray(row.thread) ? row.thread[0] : row.thread;
  if (!t) return null;
  const thread: ThreadSnapshot = {
    id: t.id,
    platform: t.platform,
    external_id: t.external_id,
    url: t.url,
    community: t.community,
    title: t.title,
    body: t.body,
    score: t.score,
    comment_count: t.comment_count,
    created_at: t.thread_created_at,
    fetched_at: t.fetched_at,
  };
  return {
    id: row.id,
    thread,
    reason: row.filter_reason,
    detail: row.reason_detail ?? "",
    hypothetical_score: row.hypothetical_score,
    filtered_at: row.filtered_at,
  };
}

/**
 * Compute the start of "today" in UTC. The Quality Addendum #7
 * daily-reset contract is anchored to UTC, not the server timezone,
 * so a Sydney user and a New York user see the same row set as long
 * as the wall clock crosses 00:00 UTC. Callers can override
 * `now` for tests; production callers leave it unset.
 */
function startOfDayUtc(now: Date = new Date()): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
  );
  return d.toISOString();
}

/**
 * Read today's filtered threads for a user. "Today" is defined as
 * the calendar day in UTC — Quality Addendum #7 specifies a daily
 * reset for the review surface, anchored to a stable timezone so
 * users in different regions see consistent rollover behavior.
 */
export async function getTodaysFilteredThreads(
  supabase: SupabaseClient,
  userId: string,
  options: { limit?: number; now?: Date } = {}
): Promise<FilteredThread[]> {
  const limit = options.limit ?? 50;
  const start = startOfDayUtc(options.now);

  const { data, error } = await supabase
    .from("deskof_filtered_threads")
    .select(
      "id, thread_id, filter_reason, reason_detail, hypothetical_score, filtered_at, thread:deskof_threads!inner(id, platform, external_id, url, community, title, body, score, comment_count, thread_created_at, fetched_at)"
    )
    .eq("user_id", userId)
    .gte("filtered_at", start)
    .order("filtered_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getTodaysFilteredThreads failed: ${error.message}`);
  }

  return ((data ?? []) as unknown as FilteredRow[])
    .map(rowToFiltered)
    .filter((r): r is FilteredThread => r !== null);
}

/**
 * Count today's filtered threads — used by the Write tab header
 * counter ("Filtered: 6 today") without paying the join cost.
 *
 * Throws on Supabase errors. Earlier versions swallowed the error
 * and returned 0, which made RLS regressions and free-tier outages
 * look identical to "nothing filtered today" — a silent failure.
 * Callers must wrap in try/catch (the API route already does).
 */
export async function countTodaysFilteredThreads(
  supabase: SupabaseClient,
  userId: string,
  options: { now?: Date } = {}
): Promise<number> {
  const start = startOfDayUtc(options.now);

  const { count, error } = await supabase
    .from("deskof_filtered_threads")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("filtered_at", start);

  if (error) {
    throw new Error(`countTodaysFilteredThreads failed: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * Insert a batch of filtered-thread rows. Service-role only —
 * Scout runs under the admin client. Idempotent on
 * (user_id, thread_id, filter_reason) so a re-run of the same
 * Scout pass is a no-op.
 */
export async function recordFilteredThreads(
  admin: SupabaseClient,
  userId: string,
  rows: Array<{
    thread_id: string;
    reason: FilterReason;
    detail: string;
    hypothetical_score: number;
  }>
): Promise<void> {
  if (rows.length === 0) return;
  const payload = rows.map((r) => ({
    user_id: userId,
    thread_id: r.thread_id,
    filter_reason: r.reason,
    reason_detail: r.detail,
    hypothetical_score: r.hypothetical_score,
    filtered_at: new Date().toISOString(),
  }));
  const { error } = await admin
    .from("deskof_filtered_threads")
    .upsert(payload, {
      onConflict: "user_id,thread_id,filter_reason",
      ignoreDuplicates: false,
    });
  if (error) {
    throw new Error(`recordFilteredThreads failed: ${error.message}`);
  }
}
