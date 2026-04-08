/**
 * Scout v2 anti-signal detection (build-plan §4.4 + Quality Addendum #7).
 *
 * Each function returns either an `AntiSignalFlag` (the thread should
 * accumulate the flag and lose composite score, possibly be filtered
 * entirely) or null (the check did not fire).
 *
 * Pure functions, no IO. The orchestrator in apps/do feeds them the
 * thread + Operator Profile + recent reply context and decides
 * whether to filter or surface based on the resulting flag set.
 *
 * Filter taxonomy matches the CHECK constraint on
 * `deskof_filtered_threads.filter_reason` from migration 00025:
 *   - astroturfed
 *   - community_hostility
 *   - no_posting_history
 *   - already_well_answered
 *   - requires_self_promotion
 *   - duplicate_coverage
 */

import type { ThreadSnapshot } from "../types/opportunity";

export type FilterReason =
  | "astroturfed"
  | "community_hostility"
  | "no_posting_history"
  | "already_well_answered"
  | "requires_self_promotion"
  | "duplicate_coverage";

export interface AntiSignalFlag {
  reason: FilterReason;
  /** Short user-facing explanation, surfaced in the filtered feed UI. */
  detail: string;
  /**
   * If true, this flag alone is enough to filter the thread out of
   * the queue entirely (instead of just docking score). The
   * orchestrator translates a hard flag into a `deskof_filtered_threads`
   * row with this reason; soft flags only contribute to anti-signal
   * count in the composite score.
   */
  hard: boolean;
}

export interface AntiSignalContext {
  thread: ThreadSnapshot;
  /** Communities the operator has actively posted in (from Operator Profile). */
  active_communities: ReadonlySet<string>;
  /** Last 7-day reply count by community for duplicate-coverage detection. */
  recent_replies_by_community: ReadonlyMap<string, number>;
  /** Operator's product names — used to detect promo-tension. */
  product_names: readonly string[];
}

/**
 * Cold-entry detection: the operator has never posted in this
 * community. Soft flag — the thread can still be a great cold entry,
 * but the user should be warned.
 */
export function detectColdEntry(ctx: AntiSignalContext): AntiSignalFlag | null {
  if (ctx.active_communities.has(ctx.thread.community)) return null;
  return {
    reason: "no_posting_history",
    detail: `You haven't posted in ${ctx.thread.community} before — replies from cold accounts are removed more often.`,
    hard: false,
  };
}

/**
 * Already-well-answered detection: high comment count + healthy
 * engagement → likely the discussion is mature and a new reply will
 * just be noise. Threshold deliberately conservative.
 */
export function detectAlreadyWellAnswered(
  ctx: AntiSignalContext
): AntiSignalFlag | null {
  const t = ctx.thread;
  const replyCount = t.existing_reply_count ?? t.comment_count;
  if (replyCount < 25) return null;
  // Old + lots of comments → discussion is mature.
  const created = Date.parse(t.created_at);
  if (Number.isNaN(created)) return null;
  const ageHours = (Date.now() - created) / (60 * 60 * 1000);
  if (ageHours < 24) return null;
  return {
    reason: "already_well_answered",
    detail: `${replyCount} replies in ${Math.round(ageHours)}h — the thread is mature and citation gain is small.`,
    hard: replyCount >= 50,
  };
}

/**
 * Requires-self-promotion detection: the only honest way the
 * operator could answer is by mentioning their own product. The
 * heuristic is intentionally narrow — looks for the product name
 * appearing inside a question phrase ("which X is best?",
 * "alternatives to X").
 */
export function detectRequiresSelfPromo(
  ctx: AntiSignalContext
): AntiSignalFlag | null {
  if (ctx.product_names.length === 0) return null;
  const haystack = `${ctx.thread.title}\n${ctx.thread.body ?? ""}`.toLowerCase();
  for (const product of ctx.product_names) {
    const p = product.trim().toLowerCase();
    if (!p || p.length < 3) continue;
    // Look for the product mentioned in a comparative or alternative
    // context. False positives here are tolerable — anti-signal flags
    // are advisory in the queue, only the hard flag filters.
    const inQuestion =
      haystack.includes(`alternatives to ${p}`) ||
      haystack.includes(`vs ${p}`) ||
      haystack.includes(`${p} vs`) ||
      haystack.includes(`like ${p}`) ||
      haystack.includes(`replace ${p}`) ||
      haystack.includes(`switch from ${p}`);
    if (inQuestion) {
      return {
        reason: "requires_self_promotion",
        detail: `The thread asks about "${product}" by name — an honest answer would read as a sales pitch.`,
        hard: false,
      };
    }
  }
  return null;
}

/**
 * Duplicate-coverage detection: the operator has already replied 3+
 * times in this community in the last 7 days. Cross-community topic
 * spacing is owned by Lens (Phase 3); this is the in-community
 * cadence guard.
 */
export function detectDuplicateCoverage(
  ctx: AntiSignalContext
): AntiSignalFlag | null {
  const recent = ctx.recent_replies_by_community.get(ctx.thread.community) ?? 0;
  if (recent < 3) return null;
  return {
    reason: "duplicate_coverage",
    detail: `You've already replied ${recent} times in ${ctx.thread.community} in the last 7 days — diminishing returns.`,
    hard: recent >= 5,
  };
}

/**
 * Community-hostility detection: high mod removal rate in the thread
 * (Reddit only — Quora doesn't expose this signal). The hostility
 * threshold is per-community in the spec, but until Pulse populates
 * `deskof_community_gate_config` with real removal stats we use a
 * single global ceiling.
 */
export function detectCommunityHostility(
  ctx: AntiSignalContext
): AntiSignalFlag | null {
  const removal = ctx.thread.mod_removal_rate;
  if (removal == null || removal < 0.2) return null;
  return {
    reason: "community_hostility",
    detail: `${Math.round(removal * 100)}% of replies in this thread have been removed by mods — high removal risk.`,
    hard: removal >= 0.4,
  };
}

/**
 * Astroturf detection placeholder: the spec calls for account-age +
 * posting-pattern analysis on the thread author. That data isn't on
 * `ThreadSnapshot` yet (it'd come from a Reddit API enrichment pass)
 * so this stub returns null until the field lands. Kept here so the
 * Phase 6 enrichment job has a clear extension point.
 */
export function detectAstroturf(_ctx: AntiSignalContext): AntiSignalFlag | null {
  return null;
}

/** Run all anti-signal checks in order; collect non-null flags. */
export function collectAntiSignals(ctx: AntiSignalContext): AntiSignalFlag[] {
  const checks = [
    detectColdEntry,
    detectAlreadyWellAnswered,
    detectRequiresSelfPromo,
    detectDuplicateCoverage,
    detectCommunityHostility,
    detectAstroturf,
  ];
  const flags: AntiSignalFlag[] = [];
  for (const check of checks) {
    const flag = check(ctx);
    if (flag) flags.push(flag);
  }
  return flags;
}
