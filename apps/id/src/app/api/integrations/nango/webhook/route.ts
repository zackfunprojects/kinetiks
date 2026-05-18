/**
 * POST /api/integrations/nango/webhook
 *
 * The single ingest point for Nango sync events. Verifies the HMAC-SHA256
 * signature, parses the payload, resolves the kinetiks_account_id from the
 * Nango connection id, dispatches to the registered per-source handler,
 * and writes a kinetiks_sync_logs row.
 *
 * Auth: HMAC-SHA256 signature in `X-Nango-Hmac-Sha256` header, verified
 * against NANGO_WEBHOOK_SECRET. No bearer token; Nango never sends one.
 *
 * Reply timing: Nango times out at 20s. The handler MUST complete in <20s
 * or Nango will retry (twice with backoff). Long work belongs in the
 * Oracle analyze cron, not here.
 *
 * Response shapes:
 *   200 { ok: true, status: 'processed' | 'replay' | 'unhandled' | 'auth_event' | 'forward_event' }
 *   400 { error: 'invalid_body', message }
 *   401 { error: 'unauthorized', reason }
 *   404 { error: 'connection_not_found' }
 *   500 { error: 'internal', message }
 */

import "server-only";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  NANGO_SIGNATURE_HEADER,
  payloadSha256,
  verifyNangoSignature,
} from "@/lib/integrations/nango/webhook-verify";
import { NangoWebhookSchema } from "@/lib/integrations/nango/types";
import { dispatchNangoSyncWebhook } from "@/lib/integrations/nango/handlers";
import {
  isRecentReplay,
  writeSyncLog,
} from "@/lib/integrations/nango/sync-logs";

// Defensive: ensure handler registrations exist even if a request lands
// before full server boot. instrumentation-node.ts also imports ./boot
// during startup; ESM caches the module so this is a no-op afterward.
import "@/lib/integrations/nango/handlers/boot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // node:crypto + Supabase admin client

export async function POST(request: Request) {
  // 1. Read the raw body BEFORE parsing JSON. The HMAC depends on the
  //    byte-exact request body.
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: err instanceof Error ? err.message : "could not read body",
      },
      { status: 400 }
    );
  }

  // 2. Signature verification.
  const signature = request.headers.get(NANGO_SIGNATURE_HEADER);
  const secret = process.env.NANGO_WEBHOOK_SECRET;
  const verify = verifyNangoSignature(rawBody, signature, secret);
  if (!verify.ok) {
    return NextResponse.json(
      { error: "unauthorized", reason: verify.reason },
      { status: 401 }
    );
  }

  // 3. Parse + schema-validate.
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "json parse failed" },
      { status: 400 }
    );
  }

  const result = NangoWebhookSchema.safeParse(parsedJson);
  if (!result.success) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 }
    );
  }
  const webhook = result.data;

  // 4. Auth and forward events are observed but not processed in D2.
  if (webhook.type === "auth") {
    // TODO(D2 follow-up): update kinetiks_connections.status on auth events.
    return NextResponse.json({ ok: true, status: "auth_event" });
  }
  if (webhook.type === "forward") {
    return NextResponse.json({ ok: true, status: "forward_event" });
  }

  // 5. Resolve the kinetiks account.
  const admin = createAdminClient();
  const { data: connection, error: connErr } = await admin
    .from("kinetiks_connections")
    .select("id, account_id, provider, status")
    .eq("nango_connection_id", webhook.connectionId)
    .eq("nango_provider_config_key", webhook.providerConfigKey)
    .maybeSingle();

  if (connErr) {
    return NextResponse.json(
      { error: "internal", message: connErr.message },
      { status: 500 }
    );
  }
  if (!connection) {
    // The connection landed at Nango but never made it into our DB —
    // possibly an out-of-order webhook between Connect UI redirect and
    // our /api/connections POST. Log it and 404 so Nango retries.
    return NextResponse.json(
      { error: "connection_not_found" },
      { status: 404 }
    );
  }

  const arrivedAt = new Date();
  const payloadHash = payloadSha256(rawBody);

  // 6. Replay detection.
  if (await isRecentReplay(admin, connection.account_id, payloadHash)) {
    await writeSyncLog(admin, {
      accountId: connection.account_id,
      source: webhook.providerConfigKey,
      syncName: webhook.syncName,
      nangoConnectionId: webhook.connectionId,
      status: "skipped",
      errorClass: "replay",
      errorMessage: "duplicate webhook payload within 5 min window",
      payloadSha256: payloadHash,
      arrivedAt,
      providerCompletedAt: webhook.endedAt ? new Date(webhook.endedAt) : null,
    });
    return NextResponse.json({ ok: true, status: "replay" });
  }

  // 7. Nango told us the sync failed → log the failure, do not dispatch.
  if (!webhook.success) {
    await writeSyncLog(admin, {
      accountId: connection.account_id,
      source: webhook.providerConfigKey,
      syncName: webhook.syncName,
      nangoConnectionId: webhook.connectionId,
      status: "failed",
      errorClass: "nango_sync_failed",
      errorMessage: webhook.failureReason ?? "Nango reported sync failure.",
      payloadSha256: payloadHash,
      arrivedAt,
      providerCompletedAt: webhook.endedAt ? new Date(webhook.endedAt) : null,
    });
    return NextResponse.json({ ok: true, status: "processed" });
  }

  // 8. Dispatch to the registered handler.
  const start = Date.now();
  const handlerResult = await dispatchNangoSyncWebhook({
    accountId: connection.account_id,
    webhook,
    arrivedAt,
    payloadSha256: payloadHash,
  });
  const durationMs = Date.now() - start;

  await writeSyncLog(admin, {
    accountId: connection.account_id,
    source: webhook.providerConfigKey,
    syncName: webhook.syncName,
    nangoConnectionId: webhook.connectionId,
    status: handlerResult.status,
    recordsAdded: handlerResult.recordsAdded,
    recordsUpdated: handlerResult.recordsUpdated,
    recordsDeleted: handlerResult.recordsDeleted,
    durationMs,
    errorClass: handlerResult.errorClass ?? null,
    errorMessage: handlerResult.errorMessage ?? null,
    payloadSha256: payloadHash,
    arrivedAt,
    providerCompletedAt: webhook.endedAt ? new Date(webhook.endedAt) : null,
  });

  const responseStatus =
    handlerResult.status === "skipped" && handlerResult.errorClass === "no_handler_registered"
      ? "unhandled"
      : "processed";

  return NextResponse.json({ ok: true, status: responseStatus });
}
