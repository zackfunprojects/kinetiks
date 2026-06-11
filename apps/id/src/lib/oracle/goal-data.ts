/**
 * Goal data writer (C1).
 *
 * Computes each active goal's `current_value` from the account's metric
 * cache rows, appends a `kinetiks_goal_snapshots` point, and updates
 * `kinetiks_goals.current_value`. This is what turns the goal-first
 * dashboard from permanent zeros into real pace/forecast — the math in
 * goal-tracker.ts has been waiting for these inputs.
 *
 * Aggregation semantics per metric:
 *   - "window" metrics (sessions, clicks, spend, new customers...) are
 *     flows. When the goal has a period and the source writes a daily
 *     series, we sum the series inside [period_start, today] — the true
 *     in-period total. Otherwise we fall back to the 28d window scalar
 *     (documented approximation, better than zero).
 *   - "level" metrics (MRR, churn rate, avg position, ROAS...) are
 *     states. current_value is simply the latest reading.
 *
 * Snapshot cadence: the oracle cron runs every 30 minutes; writing 48
 * identical points a day is noise. We append only when the value
 *  changed vs the latest snapshot OR the latest snapshot is older than
 * SNAPSHOT_MIN_INTERVAL_HOURS — bounded growth, daily-grained trend.
 *
 * Failures here never fail the oracle run: each goal is independent,
 * and errors capture to Sentry with ids only.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { captureException } from "@/lib/observability/sentry";
import { getMetricDefinition } from "./metric-schema";
import { readDailySeries, readScalar } from "./cross-source-inputs";
import type { CachedMetricRow } from "./cache-reader";

const SNAPSHOT_MIN_INTERVAL_HOURS = 6;

/**
 * Flow vs state classification. "window" metrics accumulate over the
 * goal period (sum of dailies / window totals); "level" metrics are
 * read as the latest value. Exhaustive over the metric schema — the
 * unit test fails if a registered metric is missing here, so a new
 * metric cannot silently default.
 */
const METRIC_AGGREGATION: Readonly<Record<string, "window" | "level">> = {
  // ga4
  ga4_sessions: "window",
  ga4_users: "window",
  ga4_bounce_rate: "level",
  // gsc
  gsc_impressions: "window",
  gsc_clicks: "window",
  gsc_ctr: "level",
  gsc_avg_position: "level",
  // meta_ads
  meta_spend: "window",
  meta_impressions: "window",
  meta_clicks: "window",
  meta_ctr: "level",
  meta_cpc: "level",
  meta_cpm: "level",
  meta_conversions: "window",
  meta_conversion_value: "window",
  meta_roas: "level",
  // google_ads
  gads_spend: "window",
  gads_impressions: "window",
  gads_clicks: "window",
  gads_ctr: "level",
  gads_cpc: "level",
  gads_conversions: "window",
  gads_conversion_value: "window",
  gads_roas: "level",
  // stripe
  stripe_mrr: "level",
  stripe_arr: "level",
  stripe_new_customers: "window",
  stripe_churn_rate: "level",
  stripe_avg_order_value: "level",
  stripe_refund_rate: "level",
  stripe_ltv: "level",
  // hubspot (aggregator snapshots)
  hubspot_deals_open: "level",
  hubspot_deal_value_open: "level",
  hubspot_deals_won_28d: "window",
  hubspot_deal_value_won_28d: "window",
  hubspot_deals_created_28d: "window",
  hubspot_avg_deal_close_days: "level",
  hubspot_win_rate_28d: "level",
  hubspot_contacts_created_28d: "window",
  // Suite-app metrics (registered for future apps; no cache rows yet,
  // so computeGoalValue returns null for these regardless — classified
  // so the exhaustiveness invariant stays total and a new registry
  // entry forces an explicit decision here).
  hv_emails_sent: "window",
  hv_emails_opened: "window",
  hv_open_rate: "level",
  hv_reply_rate: "level",
  hv_bounce_rate: "level",
  hv_sequences_active: "level",
  hv_contacts_enrolled: "window",
  hv_meetings_booked: "window",
  hv_positive_replies: "window",
  dm_articles_published: "window",
  dm_total_views: "window",
  dm_avg_time_on_page: "level",
  dm_cta_clicks: "window",
  lt_pitches_sent: "window",
  lt_media_mentions: "window",
  lt_coverage_reach: "window",
  ht_page_views: "window",
  ht_conversion_rate: "level",
  ht_leads_captured: "window",
};

export function metricAggregation(metricKey: string): "window" | "level" | null {
  return METRIC_AGGREGATION[metricKey] ?? null;
}

interface GoalRow {
  id: string;
  metric_key: string | null;
  period_start: string | null;
  period_end: string | null;
  current_value: number;
}

export interface GoalDataResult {
  goals_seen: number;
  goals_updated: number;
  snapshots_written: number;
}

/**
 * Resolve a goal's current value from the cache rows, or null when the
 * metric has no readable bucket yet. Pure — unit-tested directly.
 */
export function computeGoalValue(
  goal: Pick<GoalRow, "metric_key" | "period_start">,
  cacheRows: CachedMetricRow[],
  today: Date = new Date(),
): number | null {
  if (!goal.metric_key) return null;
  const def = getMetricDefinition(goal.metric_key);
  if (!def) return null;
  const aggregation = metricAggregation(goal.metric_key);
  if (!aggregation) return null;

  const source = def.source_app;

  if (aggregation === "level") {
    // States: latest reading. All sources write a 28d-window bucket
    // (stripe/hubspot under `period`, the rest under `date_range`).
    return (
      readScalar(cacheRows, source, goal.metric_key, "last_28_days") ??
      readScalar(cacheRows, source, goal.metric_key, "snapshot") ??
      readScalar(cacheRows, source, goal.metric_key, "last_7_days")
    );
  }

  // Flows: sum the daily series inside the goal period when available.
  if (goal.period_start) {
    const daily = readDailySeries(cacheRows, source, goal.metric_key);
    if (daily.length > 0) {
      const start = goal.period_start.slice(0, 10);
      const end = today.toISOString().slice(0, 10);
      const inPeriod = daily.filter((p) => p.date >= start && p.date <= end);
      // A daily series with zero in-period points IS the answer: the
      // in-period total is 0 (e.g. a goal that starts today). Falling
      // through to the 28d window would overstate a just-started goal.
      return round2(inPeriod.reduce((sum, p) => sum + p.value, 0));
    }
  }

  // Fallback: the 28d window total (approximation when no daily series
  // exists for the source — documented in the module header).
  return (
    readScalar(cacheRows, source, goal.metric_key, "last_28_days") ??
    readScalar(cacheRows, source, goal.metric_key, "snapshot")
  );
}

/**
 * Update every active, metric-bound goal for the account. Reuses the
 * cache rows the oracle run already loaded — zero extra provider reads.
 */
export async function updateGoalData(
  admin: SupabaseClient,
  accountId: string,
  cacheRows: CachedMetricRow[],
  today: Date = new Date(),
): Promise<GoalDataResult> {
  const result: GoalDataResult = {
    goals_seen: 0,
    goals_updated: 0,
    snapshots_written: 0,
  };

  const { data: goals, error } = await admin
    .from("kinetiks_goals")
    .select("id, metric_key, period_start, period_end, current_value")
    .eq("account_id", accountId)
    .eq("status", "active")
    .not("metric_key", "is", null);

  if (error) {
    await captureException(new Error(error.message), {
      tags: { route: "oracle_goal_data", action: "goal_data.load", stage: "select", app: "id" },
      user: { id: accountId },
      extra: {},
    });
    return result;
  }

  for (const goal of (goals ?? []) as GoalRow[]) {
    result.goals_seen += 1;
    try {
      const value = computeGoalValue(goal, cacheRows, today);
      if (value == null) continue;

      if (value !== goal.current_value) {
        const { error: updateError } = await admin
          .from("kinetiks_goals")
          .update({ current_value: value, updated_at: today.toISOString() })
          .eq("id", goal.id)
          .eq("account_id", accountId);
        if (updateError) throw new Error(updateError.message);
        result.goals_updated += 1;
      }

      if (await shouldSnapshot(admin, goal, value, today)) {
        const { error: snapError } = await admin
          .from("kinetiks_goal_snapshots")
          .insert({
            goal_id: goal.id,
            account_id: accountId,
            value,
            snapshot_at: today.toISOString(),
          });
        if (snapError) throw new Error(snapError.message);
        result.snapshots_written += 1;
      }
    } catch (err) {
      await captureException(err, {
        tags: { route: "oracle_goal_data", action: "goal_data.write", stage: "persist", app: "id" },
        user: { id: accountId },
        extra: { goal_id: goal.id },
      });
    }
  }

  return result;
}

/**
 * Append a snapshot when the value moved or the latest point is older
 * than the minimum interval. Keeps the series daily-grained instead of
 * one point per cron tick.
 */
async function shouldSnapshot(
  admin: SupabaseClient,
  goal: GoalRow,
  value: number,
  today: Date,
): Promise<boolean> {
  const { data, error } = await admin
    .from("kinetiks_goal_snapshots")
    .select("value, snapshot_at")
    .eq("goal_id", goal.id)
    .order("snapshot_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return true;

  const latest = data as { value: number; snapshot_at: string };
  if (Number(latest.value) !== value) return true;

  const ageMs = today.getTime() - new Date(latest.snapshot_at).getTime();
  return ageMs >= SNAPSHOT_MIN_INTERVAL_HOURS * 3600 * 1000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
