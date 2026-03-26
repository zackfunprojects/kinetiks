/**
 * Agent-Native Architecture - API types
 *
 * Defines the consistent response envelope, API key types, webhook types,
 * and auth context used by all Kinetiks API endpoints.
 */

// ---------------------------------------------------------------------------
// Response Envelope
// ---------------------------------------------------------------------------

export interface ApiResponseMeta {
  page?: number;
  per_page?: number;
  total?: number;
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: ApiResponseMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: unknown;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export type ApiKeyPermission = "read-only" | "read-write" | "admin";

export type AuthMethod = "session" | "api_key" | "internal";

export interface AuthenticatedContext {
  account_id: string;
  user_id: string;
  auth_method: AuthMethod;
  /** Present only when auth_method is 'internal' and proxied from the ID API gateway */
  proxied_account_id?: string;
  /** Present only when auth_method is 'api_key' */
  key_id?: string;
  /** Present only when auth_method is 'api_key' */
  permissions?: ApiKeyPermission;
  /** App scope restriction - empty array means all apps. Present only for api_key auth */
  scope?: string[];
  /** Rate limit config - present only for api_key auth */
  rate_limit_per_minute?: number;
  /** Rate limit config - present only for api_key auth */
  rate_limit_per_day?: number;
}

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

export interface ApiKeyRecord {
  id: string;
  account_id: string;
  key_hash: string;
  key_prefix: string;
  name: string;
  permissions: ApiKeyPermission;
  scope: string[];
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  expires_at: string | null;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

/** Public-safe API key info (no hash) */
export interface ApiKeyPublic {
  id: string;
  key_prefix: string;
  name: string;
  permissions: ApiKeyPermission;
  scope: string[];
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  expires_at: string | null;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  remaining: {
    minute: number;
    day: number;
  };
  reset: {
    minute: string;
    day: string;
  };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export type WebhookEventType =
  | "proposal.accepted"
  | "proposal.declined"
  | "proposal.escalated"
  | "context.updated"
  | "confidence.changed"
  | "routing.sent";

export interface WebhookConfig {
  id: string;
  account_id: string;
  url: string;
  secret: string;
  events: WebhookEventType[];
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/** Public-safe webhook config (no secret) */
export interface WebhookConfigPublic {
  id: string;
  url: string;
  events: WebhookEventType[];
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: WebhookEventType;
  payload: Record<string, unknown>;
  status_code: number | null;
  response_body: string | null;
  attempt: number;
  success: boolean;
  delivered_at: string;
  next_retry_at: string | null;
}

export interface WebhookPayloadEnvelope {
  event: WebhookEventType;
  timestamp: string;
  kinetiks_id: string;
  data: Record<string, unknown>;
}
