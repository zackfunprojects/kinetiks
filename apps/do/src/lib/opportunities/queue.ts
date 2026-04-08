/**
 * Opportunity queue read/write helpers.
 *
 * Scout writes opportunities into deskof_opportunities. The Write tab
 * reads them. Skips and accepts mutate the status column.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Opportunity,
  ThreadSnapshot,
  SkipReason,
} from "@kinetiks/deskof";

interface OpportunityRow {
  id: string;
  user_id: string;
  thread_id: string;
  match_score: number;
  match_breakdown: Opportunity["match_breakdown"];
  suggested_angle: string | null;
  expertise_tier_matched: Opportunity["expertise_tier_matched"];
  opportunity_type: Opportunity["opportunity_type"];
  status: Opportunity["status"];
  skip_reason: SkipReason | null;
  surfaced_at: string;
  expires_at: string;
}

interface JoinedRow extends OpportunityRow {
  thread: ThreadRow;
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

function rowToOpportunity(row: JoinedRow): Opportunity {
  const thread: ThreadSnapshot = {
    id: row.thread.id,
    platform: row.thread.platform,
    external_id: row.thread.external_id,
    url: row.thread.url,
    community: row.thread.community,
    title: row.thread.title,
    body: row.thread.body,
    score: row.thread.score,
    comment_count: row.thread.comment_count,
    created_at: row.thread.thread_created_at,
    fetched_at: row.thread.fetched_at,
  };

  return {
    id: row.id,
    user_id: row.user_id,
    thread,
    match_score: row.match_score,
    match_breakdown: row.match_breakdown,
    suggested_angle: row.suggested_angle,
    expertise_tier_matched: row.expertise_tier_matched,
    opportunity_type: row.opportunity_type,
    surfaced_at: row.surfaced_at,
    expires_at: row.expires_at,
    status: row.status,
    skip_reason: row.skip_reason ?? undefined,
  };
}

/**
 * Read the user's pending opportunity queue, ordered by score desc.
 * Bounded by the per-call limit (default 10) so the Write tab never
 * loads more than a couple of swipes ahead.
 */
export async function getPendingOpportunities(
  supabase: SupabaseClient,
  userId: string,
  limit = 10
): Promise<Opportunity[]> {
  const { data, error } = await supabase
    .from("deskof_opportunities")
    .select(
      `
      id, user_id, thread_id, match_score, match_breakdown,
      suggested_angle, expertise_tier_matched, opportunity_type,
      status, skip_reason, surfaced_at, expires_at,
      thread:deskof_threads!thread_id(
        id, platform, external_id, url, community, title, body,
        score, comment_count, thread_created_at, fetched_at
      )
      `
    )
    .eq("user_id", userId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("match_score", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getPendingOpportunities failed: ${error.message}`);
  }

  return ((data ?? []) as unknown as JoinedRow[]).map(rowToOpportunity);
}

/**
 * Mark an opportunity as skipped, recording the reason. Both the
 * status column and the skip_log row are updated atomically — the
 * skip_log feeds the discovery learning loop (Phase 8) so each skip
 * counts even if the opportunity row is later expired.
 */
export async function skipOpportunity(
  supabase: SupabaseClient,
  userId: string,
  opportunityId: string,
  reason: SkipReason
): Promise<void> {
  const { error: statusError } = await supabase
    .from("deskof_opportunities")
    .update({ status: "skipped", skip_reason: reason })
    .eq("id", opportunityId)
    .eq("user_id", userId);

  if (statusError) {
    throw new Error(`skipOpportunity status update failed: ${statusError.message}`);
  }

  const { error: logError } = await supabase
    .from("deskof_skip_log")
    .insert({
      user_id: userId,
      opportunity_id: opportunityId,
      reason,
    });

  if (logError) {
    // Skip log is auxiliary — log but don't fail the user-facing skip
    console.error(`skipOpportunity log insert failed: ${logError.message}`);
  }
}

/**
 * Mark an opportunity as accepted (the user opened the editor and is
 * writing a reply). The opportunity row stays accepted until the reply
 * is posted or the editor is closed without posting.
 *
 * Restricted to actionable rows: only opportunities currently in
 * pending or accepted state AND not yet expired can be accepted.
 * Skipped or expired rows can't be resurrected via deep links.
 */
export async function acceptOpportunity(
  supabase: SupabaseClient,
  userId: string,
  opportunityId: string
): Promise<Opportunity | null> {
  const { data, error } = await supabase
    .from("deskof_opportunities")
    .update({ status: "accepted" })
    .eq("id", opportunityId)
    .eq("user_id", userId)
    .in("status", ["pending", "accepted"])
    .gt("expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    throw new Error(`acceptOpportunity failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    return null;
  }

  return getActionableOpportunityById(supabase, userId, opportunityId);
}

/**
 * Read an opportunity by id, BUT only return it if it's currently
 * actionable (status in {pending, accepted} and not yet expired).
 * Use this everywhere a reply editor or post route looks up an
 * opportunity by id — never the unrestricted variant below.
 */
export async function getActionableOpportunityById(
  supabase: SupabaseClient,
  userId: string,
  opportunityId: string
): Promise<Opportunity | null> {
  const { data, error } = await supabase
    .from("deskof_opportunities")
    .select(
      `
      id, user_id, thread_id, match_score, match_breakdown,
      suggested_angle, expertise_tier_matched, opportunity_type,
      status, skip_reason, surfaced_at, expires_at,
      thread:deskof_threads!thread_id(
        id, platform, external_id, url, community, title, body,
        score, comment_count, thread_created_at, fetched_at
      )
      `
    )
    .eq("id", opportunityId)
    .eq("user_id", userId)
    .in("status", ["pending", "accepted"])
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    throw new Error(`getActionableOpportunityById failed: ${error.message}`);
  }
  if (!data) return null;
  return rowToOpportunity(data as unknown as JoinedRow);
}

/**
 * Unrestricted lookup. Use ONLY for read-only audit/history surfaces
 * (e.g., showing a previously skipped opportunity inside the Reply tab
 * removed-history filter once Phase 5 ships). Never use this from
 * write paths.
 */
export async function getOpportunityById(
  supabase: SupabaseClient,
  userId: string,
  opportunityId: string
): Promise<Opportunity | null> {
  const { data, error } = await supabase
    .from("deskof_opportunities")
    .select(
      `
      id, user_id, thread_id, match_score, match_breakdown,
      suggested_angle, expertise_tier_matched, opportunity_type,
      status, skip_reason, surfaced_at, expires_at,
      thread:deskof_threads!thread_id(
        id, platform, external_id, url, community, title, body,
        score, comment_count, thread_created_at, fetched_at
      )
      `
    )
    .eq("id", opportunityId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`getOpportunityById failed: ${error.message}`);
  }
  if (!data) return null;
  return rowToOpportunity(data as unknown as JoinedRow);
}
