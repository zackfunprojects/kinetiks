import type { ContextLayer } from "./context";

/**
 * Per the Kinetiks Contract Addendum and Phase 7. The 10 providers
 * a customer may connect via Nango Connect, ordered roughly by
 * category for stability on the connections page.
 *
 * Removed in Phase 7:
 *   - `resend`: outbound transactional only; Kinetiks Core sends
 *     through the platform's single Resend account, not per-customer
 *     connections.
 *   - `salesforce`: target audience is vibe coders building their
 *     own apps; HubSpot covers that segment's CRM needs without the
 *     Salesforce footprint.
 *
 * Added in Phase 7:
 *   - `google_ads`, `meta_ads`: had handlers + Marcus tools since D2
 *     but were never in the public provider list. Promoted.
 *   - `tiktok`: high-signal social platform for the vibe-coder audience.
 *
 * Every value here maps to a Nango integration_id via
 * `apps/id/src/lib/integrations/nango/provider-config.ts`. Adding a
 * value here without a corresponding provider-config entry is a boot
 * failure.
 */
export type ConnectionProvider =
  | "ga4"
  | "gsc"
  | "stripe"
  | "google_ads"
  | "meta_ads"
  | "hubspot"
  | "twitter"
  | "linkedin"
  | "instagram"
  | "tiktok";

/**
 * Phase D1 — system connections (the communication layer's identity
 * surfaces, per docs/specs/agent-communication-layer-spec.md).
 *
 * These do NOT go through Nango. They use the direct OAuth path in
 * `apps/id/src/app/api/connections/system/[provider]/...` with
 * AES-256-GCM-encrypted token custody in
 * `kinetiks_connections.credentials` (the google-workspace-token.ts
 * pattern). Nango stays the broker for data providers only; system
 * connections carry send/act tokens the platform itself must hold to
 * speak as the customer's named system.
 *
 *   - `google_workspace`: Gmail send/read/modify as the system
 *     identity. Backs the `draft_email` tool (D1) and outbound email
 *     (D2) plus inbound polling (D4).
 *   - `calendar`: Google Calendar events. A SEPARATE OAuth grant from
 *     google_workspace so the customer can revoke calendar access
 *     independently (spec §4.3) without breaking email.
 *   - `slack`: workspace bot token via Slack OAuth v2. Backs
 *     send_slack_notification (D2) and the Bolt inbound surface (D3).
 *
 * Microsoft 365 is deferred until an Azure app registration exists;
 * see QUESTIONS.md. The registry in
 * `apps/id/src/lib/connections/system-providers.ts` is the seam where
 * it slots in.
 */
export type SystemConnectionProvider = "google_workspace" | "slack" | "calendar";

/**
 * Any value that may appear in `kinetiks_connections.provider`. Data
 * providers connect via Nango Connect; system providers via the
 * direct OAuth path. The two sets are disjoint — asserted at boot by
 * `assertSystemProviderConfigValid()`.
 */
export type AnyConnectionProvider = ConnectionProvider | SystemConnectionProvider;

export type ConnectionStatus = "pending" | "active" | "error" | "revoked";

export type ConnectionAuthType = "oauth" | "api_key";

export interface ConnectionRecord {
  id: string;
  account_id: string;
  provider: AnyConnectionProvider;
  status: ConnectionStatus;
  /**
   * AES-256-GCM encrypted credentials JSON (base64-packed
   * iv+authTag+ciphertext). Null for every Nango-managed data
   * connection — Nango vaults those tokens. Set for system
   * connections (google_workspace / slack / calendar), whose tokens
   * the platform holds directly; decrypted only inside Edge Functions
   * and server-side dispatchers, never in client or feature code.
   * Nulled out again on revoke so tokens do not outlive the grant.
   */
  credentials: string | null;
  /**
   * Phase 7: stable Nango connection id. Set on the auth webhook's
   * connection.created event. Required for triggerSync calls and
   * for webhook account-resolution.
   */
  nango_connection_id: string | null;
  /**
   * Phase 7: Nango integration key (matches provider-config.ts).
   * Paired with nango_connection_id for resolver lookups.
   */
  nango_provider_config_key: string | null;
  last_sync_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Public-safe connection record. Credentials field omitted because
 * (a) it would be encrypted base64 anyway and (b) Nango-managed
 * connections do not have one. `nango_connection_id` is also
 * omitted from the public projection — clients have no use for it
 * and the Nango id should not leak into the frontend bundle's
 * runtime state. Disconnect uses the Kinetiks `id`, not the Nango id.
 */
export interface ConnectionPublic {
  id: string;
  account_id: string;
  provider: AnyConnectionProvider;
  status: ConnectionStatus;
  last_sync_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type ProviderCategory =
  | "analytics"
  | "revenue"
  | "crm"
  | "social"
  | "email";

export interface ProviderDefinition {
  provider: ConnectionProvider;
  displayName: string;
  description: string;
  category: ProviderCategory;
  authType: ConnectionAuthType;
  targetLayers: ContextLayer[];
  docsUrl: string | null;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null;
  token_type: string;
  scope: string | null;
}

export interface DataExtractionResult {
  success: boolean;
  records_processed: number;
  proposals_generated: number;
  error: string | null;
  duration_ms: number;
}

export interface ConnectionSyncLog {
  id: string;
  connection_id: string;
  account_id: string;
  status: "success" | "error";
  records_processed: number;
  proposals_generated: number;
  error: string | null;
  duration_ms: number;
  created_at: string;
}
