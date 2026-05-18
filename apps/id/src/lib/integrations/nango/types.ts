/**
 * Type definitions for the Nango webhook payload + our internal
 * handler/log contract.
 *
 * Reference: https://docs.nango.dev/implementation-guides/platform/webhooks-from-nango
 *
 * Three webhook event types Nango emits:
 *   - sync       — a scheduled or triggered sync run completed
 *   - auth       — a connection was successfully authorized
 *   - forward    — Nango forwarding a provider-side webhook (out of scope for D2)
 *
 * We only act on `sync` events in D2. `auth` events are observed and
 * logged to update kinetiks_connections.status; `forward` events are
 * acknowledged with 200 OK but otherwise ignored until a future phase.
 */

import { z } from "zod";

// ─── Wire schemas ────────────────────────────────────────────

/** Common fields across all Nango webhook event types. */
const NangoWebhookBase = z.object({
  /** Nango deployment environment (e.g. 'production', 'staging'). */
  environment: z.string().optional(),
  /** Stable id Nango assigns to a connection on successful OAuth. */
  connectionId: z.string(),
  /** The integration key as declared in nango.yaml (e.g. 'google-analytics'). */
  providerConfigKey: z.string(),
  /** End-user id we passed during Connect UI ({ end_user: { id } }). For us: kinetiks_accounts.id. */
  endUser: z
    .object({
      endUserId: z.string().optional(),
      organizationId: z.string().nullable().optional(),
    })
    .optional(),
});

/** Sync event payload. The shape Nango sends after a sync run completes. */
export const NangoSyncWebhookSchema = NangoWebhookBase.extend({
  type: z.literal("sync"),
  syncName: z.string(),
  /** Output model declared in nango.yaml for this sync. */
  model: z.string().optional(),
  syncType: z.enum(["INCREMENTAL", "INITIAL", "WEBHOOK", "FULL"]).optional(),
  /** True if the sync run succeeded; failures still arrive but we log + skip. */
  success: z.boolean(),
  /** ISO timestamp. Records modified at or after this can be fetched via GET /records. */
  modifiedAfter: z.string().optional(),
  /** Aggregate counts per Nango. */
  responseResults: z
    .object({
      added: z.number().int().nonnegative().default(0),
      updated: z.number().int().nonnegative().default(0),
      deleted: z.number().int().nonnegative().default(0),
    })
    .optional(),
  /** Failure detail when success=false. */
  failureReason: z.string().optional(),
  /** Sync run start time as ISO. */
  startedAt: z.string().optional(),
  /** Sync run end time as ISO. */
  endedAt: z.string().optional(),
});

/** Auth event payload. Nango sends after a successful OAuth/auth completion. */
export const NangoAuthWebhookSchema = NangoWebhookBase.extend({
  type: z.literal("auth"),
  operation: z.enum(["creation", "override", "refresh", "deletion"]).optional(),
  success: z.boolean(),
  failureReason: z.string().optional(),
});

/** Forwarded provider webhook. Out of scope for D2; we accept + drop. */
export const NangoForwardWebhookSchema = NangoWebhookBase.extend({
  type: z.literal("forward"),
  payload: z.unknown(),
});

export const NangoWebhookSchema = z.discriminatedUnion("type", [
  NangoSyncWebhookSchema,
  NangoAuthWebhookSchema,
  NangoForwardWebhookSchema,
]);

export type NangoSyncWebhook = z.infer<typeof NangoSyncWebhookSchema>;
export type NangoAuthWebhook = z.infer<typeof NangoAuthWebhookSchema>;
export type NangoForwardWebhook = z.infer<typeof NangoForwardWebhookSchema>;
export type NangoWebhook = z.infer<typeof NangoWebhookSchema>;

// ─── Handler contract ────────────────────────────────────────

/** Context every handler receives. */
export interface NangoHandlerContext {
  /** kinetiks_accounts.id resolved from the connection. */
  accountId: string;
  /** Raw webhook payload (already verified + parsed). */
  webhook: NangoSyncWebhook;
  /** Webhook arrival time (the moment our route received the request). */
  arrivedAt: Date;
  /** sha256 of the raw webhook body, for replay detection in sync_logs. */
  payloadSha256: string;
}

/** Result a handler returns; the route writes this to kinetiks_sync_logs. */
export interface NangoHandlerResult {
  status: "succeeded" | "partial" | "failed" | "skipped";
  recordsAdded: number;
  recordsUpdated: number;
  recordsDeleted: number;
  /** When status != 'succeeded'. */
  errorClass?: string;
  errorMessage?: string;
}

/** A handler function — pure async, no side-channel deps. */
export type NangoHandlerFn = (
  ctx: NangoHandlerContext
) => Promise<NangoHandlerResult>;

/** Registration entry for a handler. */
export interface NangoHandlerRegistration {
  providerConfigKey: string;
  syncName: string;
  handler: NangoHandlerFn;
}
