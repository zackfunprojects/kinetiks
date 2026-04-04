export interface Anomaly {
  metric_key: string;
  value: number;
  expected: number;
  z_score: number;
  severity: "low" | "medium" | "high";
  direction: "above" | "below";
  timestamp: string;
}

export interface Trend {
  metric_key: string;
  direction: "up" | "down" | "flat";
  slope: number;
  r_squared: number;
  confidence: number;
  period_days: number;
}

/**
 * Detect anomalies using z-score against a 30-day adaptive baseline.
 */
export function detectAnomalies(
  values: { value: number; timestamp: string }[],
  metricKey: string
): Anomaly[] {
  if (values.length < 10) return []; // Need sufficient data

  // Use last 30 values as baseline
  const baseline = values.slice(0, -1).slice(-30);
  const latest = values[values.length - 1];

  const mean = baseline.reduce((sum, v) => sum + v.value, 0) / baseline.length;
  const variance = baseline.reduce((sum, v) => sum + Math.pow(v.value - mean, 2), 0) / baseline.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return []; // No variance

  const zScore = (latest.value - mean) / stdDev;
  const absZ = Math.abs(zScore);

  if (absZ < 2) return []; // Not anomalous

  let severity: Anomaly["severity"];
  if (absZ >= 3.5) severity = "high";
  else if (absZ >= 2.5) severity = "medium";
  else severity = "low";

  return [{
    metric_key: metricKey,
    value: latest.value,
    expected: mean,
    z_score: Math.round(zScore * 100) / 100,
    severity,
    direction: zScore > 0 ? "above" : "below",
    timestamp: latest.timestamp,
  }];
}

/**
 * Detect trends using linear regression on a 14-day window.
 */
export function detectTrends(
  values: { value: number; timestamp: string }[],
  metricKey: string,
  periodDays = 14
): Trend | null {
  const window = values.slice(-periodDays);
  if (window.length < 5) return null;

  const n = window.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += window[i].value;
    sumXY += i * window[i].value;
    sumX2 += i * i;
    sumY2 += window[i].value * window[i].value;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denom;

  // R-squared
  const ssRes = window.reduce((sum, v, i) => {
    const predicted = (sumY / n) + slope * (i - sumX / n);
    return sum + Math.pow(v.value - predicted, 2);
  }, 0);
  const ssTot = window.reduce((sum, v) => sum + Math.pow(v.value - sumY / n, 2), 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  // Only report if R-squared is reasonable
  if (rSquared < 0.3) return null;

  const direction: Trend["direction"] =
    Math.abs(slope) < 0.01 * (sumY / n) ? "flat" : slope > 0 ? "up" : "down";

  return {
    metric_key: metricKey,
    direction,
    slope: Math.round(slope * 1000) / 1000,
    r_squared: Math.round(rSquared * 100) / 100,
    confidence: Math.min(rSquared * 100, 100),
    period_days: periodDays,
  };
}
