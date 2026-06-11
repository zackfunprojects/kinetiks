/**
 * Oracle runner — analyzeAccount() orchestrator.
 *
 * Slice 10 + C1. Called by the Node-side /api/internal/oracle/analyze
 * route (which is invoked by the oracle-analysis-cron Edge Function
 * every 30 minutes).
 *
 * Per-account flow:
 *   1. Eligibility check (connected sources + recent cache rows)
 *   2. Materialize HubSpot CRM into derived metrics (if connected)
 *   3. Run per-source detectors (anomaly, trend) on each source's series
 *   4. Run cross-source + dimensional + correlation detectors (C1) —
 *      each behind an input builder that returns null until the cache
 *      holds the data that detector needs (see cross-source-inputs.ts)
 *   5. Apply `MAX_SIGNALS_PER_ACCOUNT` cap (truncate lowest severity)
 *   6. Polish via Haiku (one batched call)
 *   7. Dedup against kinetiks_insights (24h window)
 *   8. Write surviving insights to kinetiks_insights
 *   8.5. Update goal data from the same cache rows (C1): current_value
 *        + kinetiks_goal_snapshots, never fatal to the run
 *   9. Stamp kinetiks_oracle_runs with counts + ai_call_id
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  detectAnomalies,
  detectTrends,
} from "./pattern-detector";
import {
  detectCrossDimensionDrill,
  detectMetricCorrelations,
  detectTopMovers,
} from "./detectors";
import {
  detectChannelReliability,
  detectConversionVelocity,
  detectOrganicConverters,
  detectRoasByChannel,
  detectSpendEfficiency,
  detectTrackingGap,
} from "./detectors/cross-source";
import {
  buildChannelReliabilityInput,
  buildConversionVelocityInput,
  buildCorrelationInputs,
  buildDimensionalInputs,
  buildOrganicConvertersInput,
  buildRoasByChannelInput,
  buildSpendEfficiencyInput,
  buildTrackingGapInput,
  toDrillInput,
  toTopMoverInput,
} from "./cross-source-inputs";
import { listConnectedSources, loadAccountCacheRows } from "./cache-reader";
import { aggregateHubspotMetrics } from "./crm-aggregator";
import { updateGoalData } from "./goal-data";
import { loadRecentDedupKeys } from "./insights/dedup";
import { writeInsights } from "./insights/writer";
import { polishSignals } from "./polish";
import { isoWeek, type OracleSignal, type SignalSeverity } from "./insights/types";

export const MAX_SIGNALS_PER_ACCOUNT = 20;

interface RunResultCounts {
  signals_total: number;
  signals_by_type: Record<string, number>;
  insights_written: number;
  insights_deduped: number;
  proposals_emitted: number;
  haiku_tokens_in: number;
  haiku_tokens_out: number;
  /** C1 — goal-data writer outcome for this run. */
  goals_updated: number;
  goal_snapshots_written: number;
}

export interface AnalyzeAccountResult {
  account_id: string;
  status: "succeeded" | "skipped" | "errored";
  reason?: string;
  counts: RunResultCounts;
  duration_ms: number;
  sources_evaluated: string[];
}

const SEVERITY_RANK: Record<SignalSeverity, number> = {
  info: 0,
  notable: 1,
  urgent: 2,
};

export async function analyzeAccount(
  admin: SupabaseClient,
  accountId: string
): Promise<AnalyzeAccountResult> {
  const startedAt = Date.now();
  const counts: RunResultCounts = {
    signals_total: 0,
    signals_by_type: {},
    insights_written: 0,
    insights_deduped: 0,
    proposals_emitted: 0,
    haiku_tokens_in: 0,
    haiku_tokens_out: 0,
    goals_updated: 0,
    goal_snapshots_written: 0,
  };

  const runRowId = await openRunRow(admin, accountId);

  try {
    // 1. Eligibility
    const sources = await listConnectedSources(admin, accountId);
    if (sources.length === 0) {
      return finalizeSkipped(admin, runRowId, accountId, counts, startedAt, [], "no_active_connection");
    }

    // 2. CRM materialization (HubSpot only for D2)
    if (sources.includes("hubspot")) {
      try {
        await aggregateHubspotMetrics(admin, accountId);
      } catch {
        // Aggregation failure shouldn't block other detectors. Counts
        // stay accurate via cache misses downstream.
      }
    }

    const cacheRows = await loadAccountCacheRows(admin, accountId, sources);
    if (cacheRows.length === 0) {
      return finalizeSkipped(admin, runRowId, accountId, counts, startedAt, sources, "no_recent_cache");
    }

    // 3. Per-source detection: anomalies + trends on overall time series
    const signals: OracleSignal[] = [];
    for (const source of sources) {
      const rowsForSource = cacheRows.filter((r) => r.source === source);
      // Pick the time-series row per source (input.dimensions === ['date'])
      const timeSeriesRows = rowsForSource.filter((r) => {
        const dims = (r.input as { dimensions?: string[] }).dimensions;
        return Array.isArray(dims) && dims.length === 1 && dims[0] === "date";
      });
      for (const row of timeSeriesRows) {
        const metricKey = (row.input as { metric?: string }).metric;
        if (!metricKey) continue;
        const responseRows = ((row.response as { rows?: Array<{ dimensions: Record<string, string>; value: number }> }).rows) ?? [];
        const series = responseRows
          .map((rr) => ({
            value: rr.value,
            timestamp: (rr.dimensions.date ?? "") + "T00:00:00Z",
          }))
          .filter((p) => p.timestamp.length > 11)
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

        if (series.length < 5) continue;
        const week = isoWeek(new Date());

        // Anomalies
        for (const a of detectAnomalies(series, metricKey)) {
          signals.push({
            type: "anomaly",
            severity: a.severity === "high" ? "urgent" : a.severity === "medium" ? "notable" : "info",
            source_app: source,
            source_operator: "oracle.analyzer.anomaly",
            summary: `${metricKey} ${a.direction} expected (z=${a.z_score})`,
            evidence: {
              metric_key: metricKey,
              value: a.value,
              expected: a.expected,
              z_score: a.z_score,
              direction: a.direction,
              timestamp: a.timestamp,
            },
            suggested_action: {
              kind: "open_thread",
              label: `Investigate ${metricKey} ${a.direction} spike`,
            },
            dedup_key: `anomaly:${metricKey}::${a.direction}:${week}`,
          });
        }

        // Trend
        const t = detectTrends(series, metricKey);
        if (t) {
          signals.push({
            type: "trend",
            severity: "info",
            source_app: source,
            source_operator: "oracle.analyzer.trend",
            summary: `${metricKey} trending ${t.direction} (r²=${t.r_squared})`,
            evidence: {
              metric_key: metricKey,
              direction: t.direction,
              slope: t.slope,
              r_squared: t.r_squared,
              confidence: t.confidence,
              period_days: t.period_days,
            },
            suggested_action: {
              kind: "open_thread",
              label: `Understand ${metricKey} trend`,
            },
            dedup_key: `trend:${metricKey}:${t.direction}:${week}`,
          });
        }
      }
    }

    // 4. Cross-source + dimensional + correlation detectors (C1).
    // Every builder is data-gated: null means the cache does not yet
    // hold what that detector needs, and the detector is skipped
    // without error. The detectors additionally self-gate on
    // available_sources, so both layers must agree before a signal
    // can exist.
    const roasInput = buildRoasByChannelInput(cacheRows, sources);
    if (roasInput) signals.push(...detectRoasByChannel(roasInput));

    const trackingGapInput = buildTrackingGapInput(cacheRows, sources);
    if (trackingGapInput) signals.push(...detectTrackingGap(trackingGapInput));

    const spendEfficiencyInput = buildSpendEfficiencyInput();
    if (spendEfficiencyInput) signals.push(...detectSpendEfficiency(spendEfficiencyInput));

    const organicInput = buildOrganicConvertersInput();
    if (organicInput) signals.push(...detectOrganicConverters(organicInput));

    const reliabilityInput = buildChannelReliabilityInput();
    if (reliabilityInput) signals.push(...detectChannelReliability(reliabilityInput));

    const velocityInput = buildConversionVelocityInput();
    if (velocityInput) signals.push(...detectConversionVelocity(velocityInput));

    // Dimensional pair: drill first, then top-movers with drill's dedup
    // keys so the more specific drill signal wins the overlap.
    const dimensionalInputs = buildDimensionalInputs(cacheRows);
    const drillDedupKeys = new Set<string>();
    for (const dim of dimensionalInputs) {
      const drillSignals = detectCrossDimensionDrill(toDrillInput(dim));
      for (const s of drillSignals) drillDedupKeys.add(s.dedup_key);
      signals.push(...drillSignals);
    }
    for (const dim of dimensionalInputs) {
      signals.push(...detectTopMovers(toTopMoverInput(dim, drillDedupKeys)));
    }

    for (const corrInput of buildCorrelationInputs(cacheRows, sources)) {
      signals.push(...detectMetricCorrelations(corrInput));
    }

    // 4.5. Bucket signals counted before cap
    counts.signals_total = signals.length;
    for (const s of signals) {
      counts.signals_by_type[s.type] = (counts.signals_by_type[s.type] ?? 0) + 1;
    }

    // 5. Cap: keep the highest-severity MAX_SIGNALS_PER_ACCOUNT
    const sortedSignals = [...signals].sort(
      (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    );
    const capped = sortedSignals.slice(0, MAX_SIGNALS_PER_ACCOUNT);

    // 6. Polish (Haiku batched). Failure → fallback handled inside polishSignals.
    const polished = await polishSignals({ signals: capped });

    // 7. Dedup
    const recentKeys = await loadRecentDedupKeys(admin, accountId);
    const survivors = polished.filter((s) => !recentKeys.has(s.dedup_key));
    counts.insights_deduped = polished.length - survivors.length;

    // 8. Write
    if (survivors.length > 0) {
      const result = await writeInsights(admin, {
        accountId,
        signals: survivors,
      });
      counts.insights_written = result.written;
    }

    // 8.5. Goal data (C1) — reuses the cache rows already in hand.
    // Never fatal: updateGoalData captures per-goal failures itself.
    const goalResult = await updateGoalData(admin, accountId, cacheRows);
    counts.goals_updated = goalResult.goals_updated;
    counts.goal_snapshots_written = goalResult.snapshots_written;

    return finalizeSucceeded(admin, runRowId, accountId, counts, startedAt, sources);
  } catch (err) {
    return finalizeErrored(
      admin,
      runRowId,
      accountId,
      counts,
      startedAt,
      err instanceof Error ? err.message : "unknown",
      err instanceof Error ? err.name : "unknown"
    );
  }
}

// ─── kinetiks_oracle_runs row management ──────────────────

async function openRunRow(admin: SupabaseClient, accountId: string): Promise<string | null> {
  const { data } = await admin
    .from("kinetiks_oracle_runs")
    .insert({
      account_id: accountId,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function finalizeSucceeded(
  admin: SupabaseClient,
  runId: string | null,
  accountId: string,
  counts: RunResultCounts,
  startedAt: number,
  sources: string[]
): Promise<AnalyzeAccountResult> {
  const durationMs = Date.now() - startedAt;
  if (runId) {
    await admin
      .from("kinetiks_oracle_runs")
      .update({
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        status: "succeeded",
        signals_total: counts.signals_total,
        signals_by_type: counts.signals_by_type,
        insights_written: counts.insights_written,
        insights_deduped: counts.insights_deduped,
        proposals_emitted: counts.proposals_emitted,
        sources_evaluated: sources,
        haiku_tokens_in: counts.haiku_tokens_in,
        haiku_tokens_out: counts.haiku_tokens_out,
      })
      .eq("id", runId);
  }
  return {
    account_id: accountId,
    status: "succeeded",
    counts,
    duration_ms: durationMs,
    sources_evaluated: sources,
  };
}

async function finalizeSkipped(
  admin: SupabaseClient,
  runId: string | null,
  accountId: string,
  counts: RunResultCounts,
  startedAt: number,
  sources: string[],
  reason: string
): Promise<AnalyzeAccountResult> {
  const durationMs = Date.now() - startedAt;
  if (runId) {
    await admin
      .from("kinetiks_oracle_runs")
      .update({
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        status: "skipped",
        reason,
        sources_evaluated: sources,
      })
      .eq("id", runId);
  }
  return {
    account_id: accountId,
    status: "skipped",
    reason,
    counts,
    duration_ms: durationMs,
    sources_evaluated: sources,
  };
}

async function finalizeErrored(
  admin: SupabaseClient,
  runId: string | null,
  accountId: string,
  counts: RunResultCounts,
  startedAt: number,
  message: string,
  errorClass: string
): Promise<AnalyzeAccountResult> {
  const durationMs = Date.now() - startedAt;
  if (runId) {
    await admin
      .from("kinetiks_oracle_runs")
      .update({
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        status: "errored",
        error_class: errorClass,
        error_message: message,
      })
      .eq("id", runId);
  }
  return {
    account_id: accountId,
    status: "errored",
    reason: message,
    counts,
    duration_ms: durationMs,
    sources_evaluated: [],
  };
}
