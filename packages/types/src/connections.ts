import type { ContextLayer } from "./context";

export type ConnectionProvider =
  | "ga4"
  | "gsc"
  | "stripe"
  | "twitter"
  | "linkedin"
  | "instagram"
  | "resend"
  | "hubspot"
  | "salesforce";

export type ConnectionStatus = "pending" | "active" | "error" | "revoked";

export type ConnectionAuthType = "oauth" | "api_key";

export interface ConnectionRecord {
  id: string;
  account_id: string;
  provider: ConnectionProvider;
  status: ConnectionStatus;
  credentials: string | null;
  last_sync_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Public-safe connection record with credentials stripped.
 * Returned by API endpoints to the client.
 */
export interface ConnectionPublic {
  id: string;
  account_id: string;
  provider: ConnectionProvider;
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
