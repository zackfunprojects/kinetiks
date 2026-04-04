import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { getMetricDefinition } from "@/lib/oracle/metric-schema";
import type { MetricDataPoint } from "@/lib/oracle/metric-schema";
import { NextRequest } from "next/server";

/**
 * GET /api/oracle/metrics?key=hv_open_rate&days=30
 * Get time-series metric data.
 */
export async function GET(request: NextRequest) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const key = request.nextUrl.searchParams.get("key");
  const days = parseInt(request.nextUrl.searchParams.get("days") ?? "30", 10);
  const app = request.nextUrl.searchParams.get("app");

  const admin = createAdminClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = admin
    .from("kinetiks_analytics_metrics")
    .select("*")
    .eq("account_id", auth.account_id)
    .gte("period_start", since)
    .order("period_start", { ascending: true });

  if (key) query = query.eq("metric_key", key);
  if (app) query = query.eq("source_app", app);

  const { data: metrics, error: queryError } = await query;

  if (queryError) return apiError("Failed to fetch metrics", 500);

  return apiSuccess({ metrics: metrics ?? [] });
}

/**
 * POST /api/oracle/metrics
 * Synapse reports metrics. Accepts array of data points.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: { metrics: MetricDataPoint[] };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.metrics?.length) {
    return apiError("No metrics provided", 400);
  }

  // Validate metric keys
  for (const m of body.metrics) {
    if (!getMetricDefinition(m.metric_key)) {
      return apiError(`Unknown metric key: ${m.metric_key}`, 400);
    }
  }

  const admin = createAdminClient();

  const rows = body.metrics.map((m) => ({
    account_id: auth.account_id,
    source_app: m.source_app,
    metric_key: m.metric_key,
    metric_value: m.value,
    metric_period: m.period,
    period_start: m.period_start,
    dimensions: m.dimensions ?? {},
  }));

  const { error: insertError } = await admin
    .from("kinetiks_analytics_metrics")
    .insert(rows);

  if (insertError) return apiError("Failed to store metrics", 500);

  return apiSuccess({ stored: rows.length });
}
