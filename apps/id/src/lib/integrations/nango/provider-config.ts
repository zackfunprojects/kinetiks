import "server-only";

import type { ConnectionProvider } from "@kinetiks/types";

/**
 * Phase 7 — static map from Kinetiks `ConnectionProvider` to its
 * Nango integration_id + the sync names the integration declares.
 *
 * The Nango dashboard owns the OAuth client credentials and the
 * provider scope configuration; this file is the bridge between
 * the Kinetiks public provider list (packages/types/src/connections.ts)
 * and Nango's integration identifiers. Changing a `nango_integration_id`
 * here without updating the corresponding integration in the Nango
 * dashboard will cause the Connect modal to fail with "unknown
 * integration".
 *
 * Adding a new ConnectionProvider value without adding a matching
 * entry here is a boot failure: `assertProviderConfig()` runs at
 * app boot and rejects unmapped providers.
 *
 * The `sync_names` array enumerates the syncs Nango runs for this
 * provider. The auth webhook (`handlers/auth.ts`) triggers each on
 * `connection.created`; the sync webhook (`webhook/route.ts`)
 * dispatches per-sync handlers by `${nango_integration_id}::${sync_name}`.
 *
 * Schema-volatility note: TikTok's Business API is the most volatile
 * of the ten. Its handler uses metadata-jsonb-catch-all so a
 * quarterly drift in Nango's TikTok models doesn't crash the sync.
 */

export interface NangoProviderConfig {
  /** Kinetiks ConnectionProvider value. */
  provider: ConnectionProvider;
  /** Nango dashboard integration_id (case-sensitive). */
  nango_integration_id: string;
  /** Nango sync names this integration declares. Order = trigger order. */
  sync_names: readonly string[];
  /**
   * Hint to the Connect modal: which integration category it lives
   * in on the Nango side. Not strictly required (Nango infers from
   * its own config) but documented here so reviewers can match
   * Kinetiks categories to Nango categories at a glance.
   */
  nango_category: "analytics" | "ads" | "crm" | "social" | "payments";
}

const PROVIDER_CONFIG: Readonly<Record<ConnectionProvider, NangoProviderConfig>> = {
  ga4: {
    provider: "ga4",
    nango_integration_id: "google-analytics",
    sync_names: ["ga4-traffic-metrics", "ga4-conversion-events"],
    nango_category: "analytics",
  },
  gsc: {
    provider: "gsc",
    nango_integration_id: "google-search-console",
    sync_names: ["gsc-search-analytics", "gsc-sitemap-status"],
    nango_category: "analytics",
  },
  stripe: {
    provider: "stripe",
    nango_integration_id: "stripe-app",
    sync_names: ["stripe-charges", "stripe-subscriptions", "stripe-customers"],
    nango_category: "payments",
  },
  google_ads: {
    provider: "google_ads",
    nango_integration_id: "google-ads",
    sync_names: ["google-ads-campaigns", "google-ads-keywords"],
    nango_category: "ads",
  },
  meta_ads: {
    provider: "meta_ads",
    nango_integration_id: "facebook-ads",
    sync_names: ["meta-ads-campaigns", "meta-ads-insights"],
    nango_category: "ads",
  },
  hubspot: {
    provider: "hubspot",
    nango_integration_id: "hubspot",
    sync_names: [
      "hubspot-deals",
      "hubspot-contacts",
      "hubspot-companies",
      "hubspot-owners",
      "hubspot-pipelines",
    ],
    nango_category: "crm",
  },
  twitter: {
    provider: "twitter",
    nango_integration_id: "twitter",
    sync_names: ["twitter-recent-posts", "twitter-profile-stats"],
    nango_category: "social",
  },
  linkedin: {
    provider: "linkedin",
    nango_integration_id: "linkedin",
    sync_names: ["linkedin-posts", "linkedin-org-stats"],
    nango_category: "social",
  },
  instagram: {
    provider: "instagram",
    nango_integration_id: "instagram-business",
    sync_names: ["instagram-media", "instagram-insights"],
    nango_category: "social",
  },
  tiktok: {
    provider: "tiktok",
    nango_integration_id: "tiktok",
    sync_names: ["tiktok-videos", "tiktok-account-stats"],
    nango_category: "social",
  },
};

/** Look up the Nango config for a Kinetiks provider. Throws on unknown. */
export function getNangoProviderConfig(
  provider: ConnectionProvider,
): NangoProviderConfig {
  const config = PROVIDER_CONFIG[provider];
  if (!config) {
    throw new Error(
      `[nango/provider-config] no Nango config registered for provider "${provider}"`,
    );
  }
  return config;
}

/** Look up by Nango integration_id (reverse direction, used by webhooks). */
export function getProviderByNangoIntegrationId(
  nangoIntegrationId: string,
): NangoProviderConfig | undefined {
  for (const config of Object.values(PROVIDER_CONFIG)) {
    if (config.nango_integration_id === nangoIntegrationId) return config;
  }
  return undefined;
}

/** Enumerate every registered config. */
export function listNangoProviderConfigs(): readonly NangoProviderConfig[] {
  return Object.values(PROVIDER_CONFIG);
}

/**
 * Boot-time assertion: every `ConnectionProvider` value has a
 * matching `NangoProviderConfig` entry, and every `sync_name` is
 * unique within its integration. Called from
 * `apps/id/src/instrumentation-node.ts`. A failure here surfaces at
 * startup, not on the first connect attempt.
 */
export function assertProviderConfigValid(): void {
  const seen = new Set<string>();
  for (const config of Object.values(PROVIDER_CONFIG)) {
    if (config.sync_names.length === 0) {
      throw new Error(
        `[nango/provider-config] provider "${config.provider}" has no sync_names`,
      );
    }
    for (const syncName of config.sync_names) {
      const key = `${config.nango_integration_id}::${syncName}`;
      if (seen.has(key)) {
        throw new Error(
          `[nango/provider-config] duplicate sync_name "${syncName}" within integration "${config.nango_integration_id}"`,
        );
      }
      seen.add(key);
    }
  }
}
