import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverWebhook } from "@/lib/webhooks/deliver";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import type { WebhookPayloadEnvelope } from "@kinetiks/types";

/**
 * POST /api/webhooks/test
 * Send a test event to a specific webhook.
 * Body: { webhook_id }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") return apiError("Invalid JSON body", 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const { webhook_id } = body as { webhook_id?: string };
  if (!webhook_id) return apiError("Missing webhook_id", 400);

  const admin = createAdminClient();

  const { data: webhook } = await admin
    .from("kinetiks_webhooks")
    .select("id, url, secret")
    .eq("id", webhook_id)
    .eq("account_id", auth.account_id)
    .single();

  if (!webhook) return apiError("Webhook not found", 404);

  const testPayload: WebhookPayloadEnvelope = {
    event: "context.updated",
    timestamp: new Date().toISOString(),
    kinetiks_id: auth.account_id,
    data: {
      test: true,
      message: "This is a test webhook delivery from Kinetiks",
    },
  };

  const success = await deliverWebhook(
    webhook.id as string,
    webhook.secret as string,
    webhook.url as string,
    "context.updated",
    testPayload
  );

  return apiSuccess({ delivered: success });
}
