/**
 * Cross-source detector input assembly (C1).
 *
 * Pure functions that build each detector's typed input from the
 * account's `kinetiks_metric_cache` rows. The runner calls these and
 * invokes the detector only when the builder returns a non-null input;
 * a null means the cache does not yet hold the data the detector needs
 * (not an error — the detector activates the day the data exists).
 *
 * What the cache actually holds today (per the Nango handlers):
 *   - ga4 / gsc:      overall scalars (7/28/90d), dimension snapshots
 *                     (28d), and a 90d daily series (dimensions:["date"]).
 *   - google_ads / meta_ads: overall scalars (7/28/90d) and campaign
 *                     dimension snapshots (7d + 28d). NO daily series.
 *   - stripe:         28d scalars only (period:"last_28_days"). No history.
 *   - hubspot:        aggregator snapshot scalars (period:"snapshot").
 *
 * Documented data gaps (builders return null until the pipeline grows):
 *   - spend-efficiency  needs weekly paid-spend + weekly MRR history;
 *     the cache holds only current windows (no MRR snapshots).
 *   - organic-converters needs per-page revenue attribution or per-page
 *     prior-period deltas; neither exists (pattern A would false-fire
 *     with revenue=0, pattern B needs deltas).
 *   - channel-reliability needs a GA4 first-touch join per deal; without
 *     it every deal reads as a "blackout" (false signal).
 *   - conversion-velocity is specified as first-GA4-session → close;
 *     the cache has no session-level join, and feeding create→close
 *     would change the detector's meaning. Gated off.
 *
 * Period construction for drill / top-movers (paid campaign dims):
 * campaign buckets exist for last_7_days and last_28_days. We compare
 * current = 7d value vs previous = (28d − 7d) / 3 — the trailing
 * three-week weekly average. Same construction for the overall scalar,
 * so share math stays internally consistent.
 */

import type { CachedMetricRow } from "./cache-reader";
import type { ChannelSpendRevenue, RoasByChannelInput } from "./detectors/cross-source/roas-by-channel";
import type { TrackingGapInput } from "./detectors/cross-source/tracking-gap";
import type { SpendEfficiencyInput } from "./detectors/cross-source/spend-efficiency";
import type { OrganicConvertersInput } from "./detectors/cross-source/organic-converters";
import type { ChannelReliabilityInput } from "./detectors/cross-source/channel-reliability";
import type { ConversionVelocityInput } from "./detectors/cross-source/conversion-velocity";
import type { CrossDimensionDrillInput } from "./detectors/cross-dimension-drill";
import type { TopMoverInput } from "./detectors/top-movers";
import type { MetricCorrelationsInput, MetricSeries } from "./detectors/metric-correlations";

// ─── Cache row readers ────────────────────────────────────

interface ResponseRow {
  dimensions: Record<string, string>;
  value: number;
}

function responseRows(row: CachedMetricRow): ResponseRow[] {
  const rows = (row.response as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (r): r is ResponseRow =>
      !!r &&
      typeof r === "object" &&
      typeof (r as { value?: unknown }).value === "number" &&
      !!(r as { dimensions?: unknown }).dimensions &&
      typeof (r as { dimensions?: unknown }).dimensions === "object",
  );
}

function inputMetric(row: CachedMetricRow): string | undefined {
  const m = (row.input as { metric?: unknown }).metric;
  return typeof m === "string" ? m : undefined;
}

/**
 * The handlers disagree on the range field: ga4/gsc/google_ads/meta_ads
 * write `date_range`; stripe and the CRM aggregator write `period`.
 * Match either.
 */
function inputRange(row: CachedMetricRow): string | undefined {
  const input = row.input as { date_range?: unknown; period?: unknown };
  if (typeof input.date_range === "string") return input.date_range;
  if (typeof input.period === "string") return input.period;
  return undefined;
}

function inputDimensions(row: CachedMetricRow): string[] {
  const dims = (row.input as { dimensions?: unknown }).dimensions;
  return Array.isArray(dims) ? dims.filter((d): d is string => typeof d === "string") : [];
}

/** Most-recent matching bucket (rows arrive ordered by refreshed_at desc). */
function findBucket(
  rows: CachedMetricRow[],
  source: string,
  metric: string,
  range: string,
  dimensions: string[],
): CachedMetricRow | undefined {
  return rows.find((r) => {
    if (r.source !== source) return false;
    if (inputMetric(r) !== metric) return false;
    if (inputRange(r) !== range) return false;
    const dims = inputDimensions(r);
    if (dims.length !== dimensions.length) return false;
    return dimensions.every((d, i) => dims[i] === d);
  });
}

/** Overall (dimensionless) scalar for a metric+range, or null. */
export function readScalar(
  rows: CachedMetricRow[],
  source: string,
  metric: string,
  range: string,
): number | null {
  const bucket = findBucket(rows, source, metric, range, []);
  if (!bucket) return null;
  const first = responseRows(bucket)[0];
  return first ? first.value : null;
}

/** Daily series from a dimensions:["date"] bucket, sorted ascending. */
export function readDailySeries(
  rows: CachedMetricRow[],
  source: string,
  metric: string,
  range = "last_90_days",
): Array<{ date: string; value: number }> {
  const bucket = findBucket(rows, source, metric, range, ["date"]);
  if (!bucket) return [];
  return responseRows(bucket)
    .map((r) => ({ date: r.dimensions.date ?? "", value: r.value }))
    .filter((p) => p.date.length === 10)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Dimension snapshot rows ({dim_value, value}) for metric×range×dimension. */
export function readDimensionRows(
  rows: CachedMetricRow[],
  source: string,
  metric: string,
  range: string,
  dimension: string,
): Array<{ dim_value: string; value: number }> {
  const bucket = findBucket(rows, source, metric, range, [dimension]);
  if (!bucket) return [];
  return responseRows(bucket)
    .map((r) => ({ dim_value: r.dimensions[dimension] ?? "", value: r.value }))
    .filter((r) => r.dim_value.length > 0);
}

// ─── Cross-source builders ────────────────────────────────

/**
 * ROAS by channel. Spend comes from the paid platforms' 28d scalars.
 * Revenue attribution v1 is the platform-reported conversion value
 * (meta_conversion_value / gads_conversion_value) — the standard
 * fallback until Stripe-side UTM joins exist. The detector's own
 * source gate (paid + stripe) still applies, so this only fires for
 * accounts where revenue data is connected at all.
 */
export function buildRoasByChannelInput(
  rows: CachedMetricRow[],
  sources: string[],
): RoasByChannelInput | null {
  const channels: ChannelSpendRevenue[] = [];

  const metaSpend = readScalar(rows, "meta_ads", "meta_spend", "last_28_days");
  const metaRevenue = readScalar(rows, "meta_ads", "meta_conversion_value", "last_28_days");
  if (metaSpend != null && metaRevenue != null) {
    channels.push({ channel: "meta", spend_28d: metaSpend, revenue_28d: metaRevenue });
  }

  const gadsSpend = readScalar(rows, "google_ads", "gads_spend", "last_28_days");
  const gadsRevenue = readScalar(rows, "google_ads", "gads_conversion_value", "last_28_days");
  if (gadsSpend != null && gadsRevenue != null) {
    channels.push({ channel: "google", spend_28d: gadsSpend, revenue_28d: gadsRevenue });
  }

  if (channels.length === 0) return null;
  return { channels, available_sources: sources };
}

/**
 * Tracking gap. Check 1 (GSC clicks vs GA4 sessions) is fully
 * computable. Checks 2/3 need ga4_conversions and stripe_checkouts —
 * neither metric exists in the cache yet, so those fields stay
 * undefined and the detector self-skips them.
 */
export function buildTrackingGapInput(
  rows: CachedMetricRow[],
  sources: string[],
): TrackingGapInput | null {
  const gscClicks = readScalar(rows, "gsc", "gsc_clicks", "last_28_days");
  const ga4Sessions = readScalar(rows, "ga4", "ga4_sessions", "last_28_days");

  if (gscClicks == null && ga4Sessions == null) return null;
  return {
    gsc_clicks_28d: gscClicks ?? undefined,
    ga4_sessions_28d: ga4Sessions ?? undefined,
    // DATA GAP: no ga4_conversions or stripe checkout-count metrics in
    // the cache; checks 2 and 3 self-skip on undefined.
    available_sources: sources,
  };
}

/**
 * DATA GAP — spend-efficiency needs 6+ weeks of weekly paid spend and
 * weekly MRR. The paid handlers write no daily series and the cache
 * keeps no MRR history (rows refresh in place). Activation requires
 * historical metric snapshots; until then this builder is honest about
 * not being able to feed the detector.
 */
export function buildSpendEfficiencyInput(): SpendEfficiencyInput | null {
  return null;
}

/**
 * DATA GAP — organic-converters needs per-page revenue attribution
 * (pattern A) or per-page prior-period deltas (pattern B). With
 * revenue hard-coded to 0 every top-ranked page would false-fire as
 * "converts poorly", and the 28d dimension snapshots have no prior
 * period to delta against.
 */
export function buildOrganicConvertersInput(): OrganicConvertersInput | null {
  return null;
}

/**
 * DATA GAP — channel-reliability needs a GA4 first-touch source per
 * HubSpot deal. No session-to-contact join exists; passing null for
 * every deal would read as a 100% tracking blackout (false signal).
 */
export function buildChannelReliabilityInput(): ChannelReliabilityInput | null {
  return null;
}

/**
 * DATA GAP — conversion-velocity is specified as first-GA4-session →
 * deal close. The cache has no session-level join; substituting deal
 * create→close would silently change what the signal claims. Gated
 * off rather than bent.
 */
export function buildConversionVelocityInput(): ConversionVelocityInput | null {
  return null;
}

// ─── Dimensional builders (drill + top-movers) ────────────

export interface DimensionalDetectorInput {
  source_app: string;
  metric_key: string;
  dimension: string;
  overall: { value: number; previous: number };
  byDimension: Array<{ dim_value: string; value: number; previous: number }>;
}

/**
 * Paid campaign dimensions are the one place the cache holds the same
 * dimension at two ranges (7d and 28d). current = the 7d value;
 * previous = (28d − 7d) / 3, the trailing three-week weekly average.
 * Internally consistent for overall and per-dimension, so the share
 * and delta math in drill/top-movers stays meaningful.
 */
const PAID_CAMPAIGN_METRICS: ReadonlyArray<{ source: string; metric: string }> = [
  { source: "meta_ads", metric: "meta_spend" },
  { source: "meta_ads", metric: "meta_clicks" },
  { source: "meta_ads", metric: "meta_conversions" },
  { source: "google_ads", metric: "gads_spend" },
  { source: "google_ads", metric: "gads_clicks" },
  { source: "google_ads", metric: "gads_conversions" },
];

export function buildDimensionalInputs(
  rows: CachedMetricRow[],
): DimensionalDetectorInput[] {
  const inputs: DimensionalDetectorInput[] = [];

  for (const { source, metric } of PAID_CAMPAIGN_METRICS) {
    const overall7 = readScalar(rows, source, metric, "last_7_days");
    const overall28 = readScalar(rows, source, metric, "last_28_days");
    if (overall7 == null || overall28 == null) continue;

    const current7 = readDimensionRows(rows, source, metric, "last_7_days", "campaign");
    const current28 = readDimensionRows(rows, source, metric, "last_28_days", "campaign");
    if (current7.length === 0 || current28.length === 0) continue;

    const prior28Map = new Map(current28.map((r) => [r.dim_value, r.value]));
    const byDimension = current7
      .map((r) => {
        const window28 = prior28Map.get(r.dim_value);
        if (window28 == null) return null;
        return {
          dim_value: r.dim_value,
          value: r.value,
          previous: trailingWeeklyAverage(window28, r.value),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (byDimension.length === 0) continue;

    inputs.push({
      source_app: source,
      metric_key: metric,
      dimension: "campaign",
      overall: {
        value: overall7,
        previous: trailingWeeklyAverage(overall28, overall7),
      },
      byDimension,
    });
  }

  return inputs;
}

/** (28d − 7d) / 3 — the prior three weeks normalized to a 7d window. */
function trailingWeeklyAverage(window28: number, window7: number): number {
  const prior21 = window28 - window7;
  if (prior21 <= 0) return 0;
  return prior21 / 3;
}

export function toDrillInput(d: DimensionalDetectorInput): CrossDimensionDrillInput {
  return { ...d };
}

export function toTopMoverInput(
  d: DimensionalDetectorInput,
  drillDedupKeys: Set<string>,
): TopMoverInput {
  return { ...d, drillDedupKeys };
}

// ─── Correlation builder ──────────────────────────────────

/**
 * Sources that write a 90d daily series the correlation detector can
 * pair. The detector itself enforces ≥14 paired days and |r| ≥ 0.55.
 */
const SERIES_METRICS_BY_SOURCE: Readonly<Record<string, readonly string[]>> = {
  ga4: ["ga4_sessions", "ga4_users", "ga4_bounce_rate"],
  gsc: ["gsc_impressions", "gsc_clicks", "gsc_ctr", "gsc_avg_position"],
};

export function buildCorrelationInputs(
  rows: CachedMetricRow[],
  sources: string[],
): MetricCorrelationsInput[] {
  const inputs: MetricCorrelationsInput[] = [];

  for (const [source, metrics] of Object.entries(SERIES_METRICS_BY_SOURCE)) {
    if (!sources.includes(source)) continue;
    const series: MetricSeries[] = [];
    for (const metric of metrics) {
      const daily = readDailySeries(rows, source, metric);
      if (daily.length >= 14) series.push({ metric_key: metric, daily });
    }
    if (series.length >= 2) {
      inputs.push({ source_app: source, series });
    }
  }

  return inputs;
}
