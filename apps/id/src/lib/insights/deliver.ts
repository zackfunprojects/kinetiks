/**
 * Insight delivery routing per the v3 spec:
 *   - urgent  → Chat + push notification
 *   - notable → morning brief (email)
 *   - info    → Analytics tab (no proactive push)
 *
 * `defaultDeliveryChannel` picks the primary channel given severity;
 * the orchestration layer (cron, Marcus's daily-brief, push pipeline)
 * fans out from there.
 */

import type { InsightDeliveryChannel, InsightSeverity } from "./types";

export function defaultDeliveryChannel(severity: InsightSeverity): InsightDeliveryChannel {
  switch (severity) {
    case "urgent":
      return "chat";
    case "notable":
      return "email";
    case "info":
    default:
      return "analytics";
  }
}

/**
 * Default expiry per severity. Insights without expiry stay around for
 * audit. These bounds drive the "ambient noise" budget — the Analytics
 * tab decays old `info` insights so it doesn't fill with stale signals.
 */
export function defaultExpiresAt(severity: InsightSeverity, now = new Date()): string | null {
  switch (severity) {
    case "urgent":
      // Urgent insights stay queryable for a year; they're audit material.
      return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
    case "notable":
      // Notable insights age out after 90 days unless acted on / pinned.
      return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
    case "info":
      // Ambient insights age out after 30 days.
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  }
}
