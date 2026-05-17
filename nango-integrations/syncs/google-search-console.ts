/**
 * Nango sync — Google Search Console — gsc-daily-performance.
 *
 * Pulls daily Search Analytics for the last 90 days from the verified
 * site URL set on the connection metadata. Three dimension slices:
 *   - overall (date only)
 *   - by query (date + query)
 *   - by page (date + page)
 *
 * Output: one GscPerformancePoint record per (date, dim, dim_value).
 *
 * GSC's Search Analytics API returns at most 25,000 rows per request and
 * pages with `startRow`. We loop through pages within each slice, capped
 * at MAX_PAGES_PER_SLICE so a runaway site doesn't blow the sync.
 *
 * Property resolution: the user picks the verified site URL during Nango
 * Connect; we stash it in connection metadata.site_url. Missing → no-op.
 */

import type { NangoSync } from "@nangohq/sync";

const MAX_ROWS_PER_REQUEST = 25000;
const MAX_PAGES_PER_SLICE = 8;            // 200K rows per slice ceiling

const DIMENSION_SLICES: Array<{
  dimension: "overall" | "query" | "page";
  ga4Dims: string[];
}> = [
  { dimension: "overall", ga4Dims: ["date"] },
  { dimension: "query", ga4Dims: ["date", "query"] },
  { dimension: "page", ga4Dims: ["date", "page"] },
];

interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GscPerformancePoint {
  id: string;
  date: string;
  dimension: string;
  dim_value: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  site_url: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function fetchGscDailyPerformance(nango: NangoSync): Promise<void> {
  const metadata = (await nango.getMetadata()) as { site_url?: string };
  const siteUrl = metadata?.site_url;

  if (!siteUrl) {
    await nango.log(
      "gsc-daily-performance: connection metadata missing site_url; user must pick a verified site. Sync no-ops."
    );
    return;
  }

  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 90);

  for (const slice of DIMENSION_SLICES) {
    let startRow = 0;
    for (let page = 0; page < MAX_PAGES_PER_SLICE; page++) {
      const records = await fetchSlice(nango, siteUrl, slice, isoDate(start), isoDate(end), startRow);
      if (records.length === 0) break;
      await nango.batchSave<GscPerformancePoint>(records, "GscPerformancePoint");
      if (records.length < MAX_ROWS_PER_REQUEST) break;
      startRow += MAX_ROWS_PER_REQUEST;
    }
  }
}

async function fetchSlice(
  nango: NangoSync,
  siteUrl: string,
  slice: (typeof DIMENSION_SLICES)[number],
  startDate: string,
  endDate: string,
  startRow: number
): Promise<GscPerformancePoint[]> {
  const response = await nango.proxy({
    method: "POST",
    endpoint: `/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    data: {
      startDate,
      endDate,
      dimensions: slice.ga4Dims,
      rowLimit: MAX_ROWS_PER_REQUEST,
      startRow,
      type: "web",
    },
    retries: 3,
  });

  const rows = ((response.data as { rows?: GscRow[] })?.rows ?? []);
  const points: GscPerformancePoint[] = [];

  for (const row of rows) {
    const date = row.keys[0]!;
    const dimValue = slice.dimension === "overall" ? "" : (row.keys[1] ?? "");
    points.push({
      id: `${slice.dimension}::${dimValue}::${date}`,
      date,
      dimension: slice.dimension,
      dim_value: dimValue,
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
      site_url: siteUrl,
    });
  }
  return points;
}
