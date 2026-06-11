/**
 * System connection provider registry — Phase D1.
 *
 * The communication layer's identity surfaces (email, Slack, calendar)
 * per docs/specs/agent-communication-layer-spec.md §2.1, §3.1, §4.1.
 * These providers do NOT go through Nango: the platform itself must
 * hold the tokens to send email, post to Slack, and create calendar
 * events as the customer's named system. Token custody is the
 * google-workspace-token.ts pattern — AES-256-GCM encrypted JSON in
 * `kinetiks_connections.credentials`, decrypted only server-side.
 *
 * Mirrors the operating model of the Nango provider config
 * (`lib/integrations/nango/provider-config.ts`): a static exhaustive
 * record, lookup helpers, and a boot assertion that fails startup —
 * not the first connect attempt — when the registry is inconsistent.
 *
 * Calendar is a SEPARATE provider from google_workspace even though
 * both use the Google OAuth client: spec §4.3 requires the customer
 * to be able to revoke calendar access independently of email, which
 * means an independent OAuth grant with its own refresh token.
 *
 * Microsoft 365 is deferred until an Azure app registration exists
 * (no MICROSOFT_365_* credentials are configured anywhere today; see
 * QUESTIONS.md). Adding it later = one entry here + an oauth kind in
 * system-oauth.ts. Nothing else changes.
 */

import type { KinetiksServerEnv } from "@kinetiks/lib/env";
import type { SystemConnectionProvider } from "@kinetiks/types";

import { isValidProvider } from "@/lib/connections/providers";

/** Which OAuth dialect the provider speaks. */
export type SystemOAuthKind = "google" | "slack";

export interface SystemProviderDefinition {
  provider: SystemConnectionProvider;
  /** Customer-facing card label on Cortex → Integrations. */
  displayName: string;
  /** One-line description shown when not connected. */
  description: string;
  oauthKind: SystemOAuthKind;
  /**
   * OAuth scopes requested at authorize time. Google providers also
   * get `openid email` appended by the authorize-URL builder so the
   * callback can learn the connected address for display + logs.
   */
  scopes: readonly string[];
}

/**
 * Scopes per the agent-communication-layer spec:
 *  - email (§2.1):    gmail.send, gmail.readonly, gmail.modify
 *  - calendar (§4.1): calendar.events, calendar.readonly
 *  - slack (§3.1):    channel/IM read + write + mentions as the bot
 */
const SYSTEM_PROVIDERS: Readonly<
  Record<SystemConnectionProvider, SystemProviderDefinition>
> = {
  google_workspace: {
    provider: "google_workspace",
    displayName: "Email",
    description: "Connect Google Workspace so your system can draft and send email as itself",
    oauthKind: "google",
    scopes: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
    ],
  },
  slack: {
    provider: "slack",
    displayName: "Slack",
    description: "Connect your team workspace so your system can post updates and answer mentions",
    oauthKind: "slack",
    scopes: [
      "app_mentions:read",
      "channels:history",
      "channels:read",
      "chat:write",
      // Lets the D2 dispatcher post under the customer's chosen
      // system name (username/icon overrides on chat.postMessage) —
      // the per-account bot identity the comms spec §3.1 describes.
      "chat:write.customize",
      "groups:history",
      "groups:read",
      "im:history",
      "im:read",
      "im:write",
      "users:read",
    ],
  },
  calendar: {
    provider: "calendar",
    displayName: "Calendar",
    description: "Connect Google Calendar for scheduling and meeting prep briefs",
    oauthKind: "google",
    scopes: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
  },
};

export function isSystemProvider(value: string): value is SystemConnectionProvider {
  return Object.prototype.hasOwnProperty.call(SYSTEM_PROVIDERS, value);
}

export function getSystemProvider(
  provider: SystemConnectionProvider,
): SystemProviderDefinition {
  return SYSTEM_PROVIDERS[provider];
}

export function listSystemProviders(): SystemProviderDefinition[] {
  return Object.values(SYSTEM_PROVIDERS);
}

/**
 * Whether the deployment has the OAuth client credentials this
 * provider needs. Cards render a "not configured" state (instead of a
 * dead Connect button) when this is false; the start route 409s as
 * the server-side backstop. Booleans only — never surface the values.
 */
export function isSystemProviderConfigured(
  provider: SystemConnectionProvider,
  env: Pick<
    KinetiksServerEnv,
    | "GOOGLE_WORKSPACE_CLIENT_ID"
    | "GOOGLE_WORKSPACE_CLIENT_SECRET"
    | "SLACK_CLIENT_ID"
    | "SLACK_CLIENT_SECRET"
  >,
): boolean {
  switch (SYSTEM_PROVIDERS[provider].oauthKind) {
    case "google":
      return Boolean(env.GOOGLE_WORKSPACE_CLIENT_ID && env.GOOGLE_WORKSPACE_CLIENT_SECRET);
    case "slack":
      return Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET);
  }
}

/**
 * Boot-time assertion, called from `instrumentation-node.ts` next to
 * `assertProviderConfigValid()` (the Nango side). Guarantees:
 *  1. every system provider declares at least one scope;
 *  2. the system provider set is disjoint from the Nango data
 *     provider set — a value in both would make connect routing
 *     ambiguous and break the one-live-row-per-(account, provider)
 *     invariant both flows assume.
 */
export function assertSystemProviderConfigValid(): void {
  for (const def of Object.values(SYSTEM_PROVIDERS)) {
    if (def.scopes.length === 0) {
      throw new Error(
        `[connections/system-providers] provider "${def.provider}" declares no OAuth scopes`,
      );
    }
    if (isValidProvider(def.provider)) {
      throw new Error(
        `[connections/system-providers] provider "${def.provider}" is also a Nango data provider; the sets must be disjoint`,
      );
    }
  }
}
