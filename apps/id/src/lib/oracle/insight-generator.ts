import { createAdminClient } from "@/lib/supabase/admin";
import type { Anomaly, Trend } from "./pattern-detector";

export type InsightType = "anomaly" | "trend" | "correlation" | "goal_risk" | "opportunity" | "recommendation" | "milestone";

export interface InsightInput {
  type: InsightType;
  title: string;
  body: string;
  supporting_data: Record<string, unknown>;
  recommendation?: string;
  source_apps: string[];
  related_goals?: string[];
  confidence: number;
  severity: "info" | "warning" | "critical" | "opportunity";
}

/**
 * Generate and store an insight.
 */
export async function createInsight(
  accountId: string,
  input: InsightInput
): Promise<string> {
  const admin = createAdminClient();

  // Dedup check - don't create duplicate insights within 24 hours
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing, error: dedupError } = await admin
    .from("kinetiks_oracle_insights")
    .select("id")
    .eq("account_id", accountId)
    .eq("insight_type", input.type)
    .eq("title", input.title)
    .gte("created_at", dayAgo)
    .limit(1);

  // If dedupe check fails, proceed with insert (tolerate duplicate over lost insight)
  if (!dedupError && existing && existing.length > 0) {
    return existing[0].id;
  }

  const { data: insight, error } = await admin
    .from("kinetiks_oracle_insights")
    .insert({
      account_id: accountId,
      insight_type: input.type,
      severity: input.severity,
      title: input.title,
      body: input.body,
      supporting_data: input.supporting_data,
      recommendation: input.recommendation ?? null,
      source_apps: input.source_apps,
      related_goals: input.related_goals ?? [],
      confidence: input.confidence,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create insight: ${error.message}`);

  return insight!.id;
}

/**
 * Create an insight from an anomaly detection.
 */
export function anomalyToInsight(anomaly: Anomaly): InsightInput {
  const direction = anomaly.direction === "above" ? "spike" : "drop";
  const change = Math.abs(((anomaly.value - anomaly.expected) / anomaly.expected) * 100).toFixed(1);

  return {
    type: "anomaly",
    title: `${anomaly.metric_key} ${direction} detected`,
    body: `${anomaly.metric_key} is ${change}% ${anomaly.direction} expected (${anomaly.value} vs ${anomaly.expected.toFixed(1)} expected). Z-score: ${anomaly.z_score}.`,
    supporting_data: { anomaly },
    severity: anomaly.severity === "high" ? "critical" : anomaly.severity === "medium" ? "warning" : "info",
    source_apps: [],
    confidence: Math.min(Math.abs(anomaly.z_score) * 20, 95),
  };
}

/**
 * Create an insight from a trend detection.
 */
export function trendToInsight(trend: Trend): InsightInput {
  const direction = trend.direction === "up" ? "upward" : trend.direction === "down" ? "downward" : "stable";

  return {
    type: "trend",
    title: `${trend.metric_key} ${direction} trend over ${trend.period_days} days`,
    body: `${trend.metric_key} shows a ${direction} trend with slope ${trend.slope} and R-squared ${trend.r_squared} over the past ${trend.period_days} days.`,
    supporting_data: { trend },
    severity: "info",
    source_apps: [],
    confidence: trend.confidence,
  };
}
