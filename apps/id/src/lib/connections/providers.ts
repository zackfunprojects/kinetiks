/**
 * Provider registry - static metadata for each supported data connection.
 *
 * This is the single source of truth for provider display names, auth types,
 * which context layers they enrich, and categorization.
 */

import type {
  ProviderDefinition,
  ConnectionProvider,
  ProviderCategory,
} from "@kinetiks/types";

const PROVIDERS: Record<ConnectionProvider, ProviderDefinition> = {
  ga4: {
    provider: "ga4",
    displayName: "Google Analytics 4",
    description:
      "Traffic sources, user behavior, top pages, and conversion data",
    category: "analytics",
    authType: "oauth",
    targetLayers: ["customers", "market"],
    docsUrl: "https://developers.google.com/analytics/devguides/reporting/data/v1",
  },
  gsc: {
    provider: "gsc",
    displayName: "Google Search Console",
    description:
      "Search queries, click-through rates, indexing status, and positioning data",
    category: "analytics",
    authType: "oauth",
    targetLayers: ["narrative", "market", "customers"],
    docsUrl: "https://developers.google.com/webmaster-tools/v1/api_reference_index",
  },
  stripe: {
    provider: "stripe",
    displayName: "Stripe",
    description:
      "Revenue data, product tiers, subscription metrics, and customer segments",
    category: "revenue",
    authType: "api_key",
    targetLayers: ["products", "customers"],
    docsUrl: "https://stripe.com/docs/api",
  },
  hubspot: {
    provider: "hubspot",
    displayName: "HubSpot",
    description:
      "Contacts, deals, companies, and pipeline data from your CRM",
    category: "crm",
    authType: "oauth",
    targetLayers: ["customers", "competitive"],
    docsUrl: "https://developers.hubspot.com/docs/api/overview",
  },
  salesforce: {
    provider: "salesforce",
    displayName: "Salesforce",
    description:
      "Leads, opportunities, accounts, and sales pipeline data",
    category: "crm",
    authType: "oauth",
    targetLayers: ["customers", "competitive"],
    docsUrl: "https://developer.salesforce.com/docs/apis",
  },
  twitter: {
    provider: "twitter",
    displayName: "X (Twitter)",
    description:
      "Follower demographics, engagement metrics, and content performance",
    category: "social",
    authType: "oauth",
    targetLayers: ["customers", "voice", "market"],
    docsUrl: "https://developer.x.com/en/docs",
  },
  linkedin: {
    provider: "linkedin",
    displayName: "LinkedIn",
    description:
      "Company page analytics, follower demographics, and post performance",
    category: "social",
    authType: "oauth",
    targetLayers: ["customers", "voice", "market"],
    docsUrl: "https://learn.microsoft.com/en-us/linkedin/",
  },
  instagram: {
    provider: "instagram",
    displayName: "Instagram",
    description:
      "Audience demographics, reach, engagement, and content insights",
    category: "social",
    authType: "oauth",
    targetLayers: ["customers", "brand"],
    docsUrl: "https://developers.facebook.com/docs/instagram-api",
  },
  resend: {
    provider: "resend",
    displayName: "Resend",
    description:
      "Email delivery metrics, open rates, and engagement data",
    category: "email",
    authType: "api_key",
    targetLayers: ["customers"],
    docsUrl: "https://resend.com/docs/api-reference/introduction",
  },
};

/**
 * Get the definition for a specific provider.
 */
export function getProvider(
  provider: ConnectionProvider
): ProviderDefinition {
  const def = PROVIDERS[provider];
  if (!def) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return def;
}

/**
 * List all registered providers.
 */
export function listProviders(): ProviderDefinition[] {
  return Object.values(PROVIDERS);
}

/**
 * Check if a string is a valid ConnectionProvider.
 */
export function isValidProvider(value: string): value is ConnectionProvider {
  return value in PROVIDERS;
}

/**
 * List providers by category.
 */
export function listProvidersByCategory(
  category: ProviderCategory
): ProviderDefinition[] {
  return Object.values(PROVIDERS).filter((p) => p.category === category);
}
