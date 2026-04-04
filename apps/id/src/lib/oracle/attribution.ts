/**
 * Position-based attribution model: 40/20/40
 * First touch: 40%, Middle touches: 20% (split evenly), Last touch: 40%
 */

export interface TouchpointData {
  source_app: string;
  action_type: string;
  detail: string | null;
  timestamp: string;
}

export interface AttributionResult {
  channel: string;
  credit: number; // 0-1
  touchpoint_count: number;
}

export function calculateAttribution(
  touchpoints: TouchpointData[]
): AttributionResult[] {
  if (touchpoints.length === 0) return [];

  // Sort by timestamp
  const sorted = [...touchpoints].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Assign credits based on position
  const credits: Record<string, { credit: number; count: number }> = {};

  for (let i = 0; i < sorted.length; i++) {
    const tp = sorted[i];
    const channel = `${tp.source_app}/${tp.action_type}`;

    let credit: number;
    if (sorted.length === 1) {
      credit = 1.0;
    } else if (i === 0) {
      credit = 0.4; // First touch
    } else if (i === sorted.length - 1) {
      credit = 0.4; // Last touch
    } else {
      // Middle touches split 20%
      credit = 0.2 / (sorted.length - 2);
    }

    if (!credits[channel]) {
      credits[channel] = { credit: 0, count: 0 };
    }
    credits[channel].credit += credit;
    credits[channel].count += 1;
  }

  return Object.entries(credits)
    .map(([channel, data]) => ({
      channel,
      credit: Math.round(data.credit * 1000) / 1000,
      touchpoint_count: data.count,
    }))
    .sort((a, b) => b.credit - a.credit);
}
