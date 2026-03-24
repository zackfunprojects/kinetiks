import { createAdminClient } from "@/lib/supabase/admin";
import { signPayload } from "./sign";
import type { WebhookEventType, WebhookPayloadEnvelope } from "@kinetiks/types";

/** Retry backoff schedule in seconds: 1min, 5min, 30min, 2hr */
const RETRY_BACKOFF = [60, 300, 1800, 7200];
const MAX_ATTEMPTS = 5;

/**
 * Deliver a webhook to a single configured endpoint.
 * Signs the payload, sends the POST, logs the delivery.
 */
export async function deliverWebhook(
  webhookId: string,
  secret: string,
  url: string,
  eventType: WebhookEventType,
  payload: WebhookPayloadEnvelope,
  attempt: number = 1
): Promise<boolean> {
  const admin = createAdminClient();
  const timestamp = new Date().toISOString();
  const body = JSON.stringify(payload);
  const signature = signPayload(secret, timestamp, body);
  const deliveryId = crypto.randomUUID();

  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let success = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Kinetiks-Signature": signature,
        "X-Kinetiks-Event": eventType,
        "X-Kinetiks-Delivery-Id": deliveryId,
        "X-Kinetiks-Timestamp": timestamp,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    statusCode = response.status;
    responseBody = await response.text().catch(() => null);
    success = response.ok;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    responseBody = message;
  }

  // Calculate next retry time
  let nextRetryAt: string | null = null;
  if (!success && attempt < MAX_ATTEMPTS) {
    const backoffSeconds = RETRY_BACKOFF[attempt - 1] ?? RETRY_BACKOFF[RETRY_BACKOFF.length - 1];
    const retryDate = new Date();
    retryDate.setSeconds(retryDate.getSeconds() + backoffSeconds);
    nextRetryAt = retryDate.toISOString();
  }

  // Log delivery
  await admin.from("kinetiks_webhook_deliveries").insert({
    webhook_id: webhookId,
    event_type: eventType,
    payload: payload as unknown as Record<string, unknown>,
    status_code: statusCode,
    response_body: responseBody?.slice(0, 1000) ?? null, // Cap response body
    attempt,
    success,
    next_retry_at: nextRetryAt,
  });

  return success;
}

/**
 * Dispatch an event to all active webhooks for an account that subscribe to this event type.
 * Fire-and-forget - errors are logged but never thrown.
 */
export async function dispatchEvent(
  accountId: string,
  eventType: WebhookEventType,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: webhooks, error } = await admin
      .from("kinetiks_webhooks")
      .select("id, url, secret, events")
      .eq("account_id", accountId)
      .eq("is_active", true);

    if (error || !webhooks || webhooks.length === 0) {
      return;
    }

    // Filter to webhooks that subscribe to this event
    const matching = webhooks.filter((w) =>
      (w.events as string[]).includes(eventType)
    );

    if (matching.length === 0) return;

    const payload: WebhookPayloadEnvelope = {
      event: eventType,
      timestamp: new Date().toISOString(),
      kinetiks_id: accountId,
      data,
    };

    // Deliver to all matching webhooks in parallel (fire-and-forget)
    await Promise.allSettled(
      matching.map((w) =>
        deliverWebhook(
          w.id as string,
          w.secret as string,
          w.url as string,
          eventType,
          payload
        )
      )
    );
  } catch (err) {
    console.error(`Webhook dispatch failed for ${eventType}:`, err);
  }
}
