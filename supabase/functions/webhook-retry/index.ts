// Webhook Retry CRON Edge Function
//
// Runs every 5 minutes. Retries failed webhook deliveries with
// exponential backoff. Max 5 attempts per delivery.
//
// CRON schedule: every 5 minutes ("*/5 * * * *")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

/** Retry backoff schedule in seconds: 1min, 5min, 30min, 2hr */
const RETRY_BACKOFF = [60, 300, 1800, 7200];
const MAX_ATTEMPTS = 5;

async function signPayload(
  secret: string,
  timestamp: string,
  body: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signingString = `${timestamp}.${body}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signingString)
  );
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

Deno.serve(async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase env vars" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find failed deliveries due for retry
  const { data: pendingRetries, error: queryError } = await admin
    .from("kinetiks_webhook_deliveries")
    .select("id, webhook_id, event_type, payload, attempt")
    .eq("success", false)
    .lte("next_retry_at", new Date().toISOString())
    .lt("attempt", MAX_ATTEMPTS)
    .order("next_retry_at", { ascending: true })
    .limit(50);

  if (queryError) {
    console.error("Failed to query pending retries:", queryError.message);
    return new Response(
      JSON.stringify({ error: queryError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!pendingRetries || pendingRetries.length === 0) {
    return new Response(
      JSON.stringify({ success: true, retried: 0 }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // Collect unique webhook IDs to fetch their URLs and secrets
  const webhookIds = [...new Set(pendingRetries.map((r) => r.webhook_id as string))];
  const { data: webhooks } = await admin
    .from("kinetiks_webhooks")
    .select("id, url, secret, is_active")
    .in("id", webhookIds);

  const webhookMap = new Map<string, { url: string; secret: string; is_active: boolean }>();
  for (const w of webhooks ?? []) {
    webhookMap.set(w.id as string, {
      url: w.url as string,
      secret: w.secret as string,
      is_active: w.is_active as boolean,
    });
  }

  let retried = 0;
  let succeeded = 0;

  for (const delivery of pendingRetries) {
    const webhook = webhookMap.get(delivery.webhook_id as string);
    if (!webhook || !webhook.is_active) continue;

    const nextAttempt = (delivery.attempt as number) + 1;
    const timestamp = new Date().toISOString();
    const body = JSON.stringify(delivery.payload);
    const signature = await signPayload(webhook.secret, timestamp, body);

    let statusCode: number | null = null;
    let responseBody: string | null = null;
    let success = false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Kinetiks-Signature": signature,
          "X-Kinetiks-Event": delivery.event_type as string,
          "X-Kinetiks-Delivery-Id": delivery.id as string,
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
      responseBody = err instanceof Error ? err.message : "Unknown error";
    }

    // Calculate next retry
    let nextRetryAt: string | null = null;
    if (!success && nextAttempt < MAX_ATTEMPTS) {
      const backoffSeconds = RETRY_BACKOFF[nextAttempt - 1] ?? RETRY_BACKOFF[RETRY_BACKOFF.length - 1];
      const retryDate = new Date();
      retryDate.setSeconds(retryDate.getSeconds() + backoffSeconds);
      nextRetryAt = retryDate.toISOString();
    }

    // Log new delivery attempt
    await admin.from("kinetiks_webhook_deliveries").insert({
      webhook_id: delivery.webhook_id,
      event_type: delivery.event_type,
      payload: delivery.payload,
      status_code: statusCode,
      response_body: typeof responseBody === "string" ? responseBody.slice(0, 1000) : null,
      attempt: nextAttempt,
      success,
      next_retry_at: nextRetryAt,
    });

    // Clear retry on the old delivery row
    await admin
      .from("kinetiks_webhook_deliveries")
      .update({ next_retry_at: null })
      .eq("id", delivery.id);

    retried++;
    if (success) succeeded++;
  }

  console.log(`Webhook retry: retried ${retried}, succeeded ${succeeded}`);

  return new Response(
    JSON.stringify({ success: true, retried, succeeded }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
