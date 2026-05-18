/**
 * Nango sync trigger helper.
 *
 * Wraps `nango.triggerSync()` for on-demand sync invocation. Used when
 * the ga4_query tool has a cache miss and wants to populate the cache
 * for next time without blocking the current Marcus turn.
 *
 * Fire-and-forget by design — callers do NOT await. Failures are logged
 * to Sentry but never thrown back into the request path.
 *
 * Gated by `NANGO_GA4_PATH` (and per-source equivalents added in later
 * slices) so the migration can be rolled out per provider.
 */

import "server-only";

import { getNangoClient, NangoMisconfiguredError } from "./client";

export interface TriggerNangoSyncInput {
  providerConfigKey: string;
  syncName: string;
  connectionId: string;
}

/**
 * Trigger a Nango sync run for a specific (connection, sync). Returns
 * silently on misconfiguration so feature-flagged callers can be a no-op
 * when NANGO_SECRET_KEY is unset locally.
 */
export async function triggerNangoSync(
  input: TriggerNangoSyncInput
): Promise<{ triggered: boolean; reason?: string }> {
  try {
    const client = getNangoClient();
    await client.triggerSync(input.providerConfigKey, [input.syncName], input.connectionId);
    return { triggered: true };
  } catch (err) {
    if (err instanceof NangoMisconfiguredError) {
      return { triggered: false, reason: "nango_misconfigured" };
    }
    return {
      triggered: false,
      reason: err instanceof Error ? err.message : "unknown",
    };
  }
}

/** Per-source feature-flag check. Returns true if Nango path is enabled. */
export function isNangoPathEnabled(source: "ga4" | "gsc" | "stripe" | "meta_ads" | "google_ads" | "hubspot"): boolean {
  const envVar = {
    ga4: "NANGO_GA4_PATH",
    gsc: "NANGO_GSC_PATH",
    stripe: "NANGO_STRIPE_PATH",
    meta_ads: "NANGO_META_ADS_PATH",
    google_ads: "NANGO_GOOGLE_ADS_PATH",
    hubspot: "NANGO_HUBSPOT_PATH",
  }[source];
  const value = process.env[envVar];
  return value === "true" || value === "1" || value === "on";
}
