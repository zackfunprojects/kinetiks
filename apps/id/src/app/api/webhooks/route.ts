import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { randomBytes } from "crypto";
import type { WebhookEventType } from "@kinetiks/types";

const VALID_EVENTS: WebhookEventType[] = [
  "proposal.accepted",
  "proposal.declined",
  "proposal.escalated",
  "context.updated",
  "confidence.changed",
  "routing.sent",
];

/**
 * GET /api/webhooks
 * List all webhook configurations for the account.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const { data: webhooks, error: fetchError } = await admin
    .from("kinetiks_webhooks")
    .select("id, url, events, is_active, description, created_at, updated_at")
    .eq("account_id", auth.account_id)
    .order("created_at", { ascending: false });

  if (fetchError) {
    return apiError("Failed to fetch webhooks", 500);
  }

  return apiSuccess(webhooks ?? []);
}

/**
 * POST /api/webhooks
 * Create a new webhook. The signing secret is generated and returned ONCE.
 * Body: { url, events, description? }
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

  const { url, events, description } = body as {
    url?: string;
    events?: string[];
    description?: string;
  };

  if (!url || typeof url !== "string") {
    return apiError("Missing or invalid 'url'", 400);
  }

  try {
    new URL(url);
  } catch {
    return apiError("Invalid URL format", 400);
  }

  if (!events || !Array.isArray(events) || events.length === 0) {
    return apiError("Missing or empty 'events' array", 400);
  }

  const invalidEvents = events.filter(
    (e) => !VALID_EVENTS.includes(e as WebhookEventType)
  );
  if (invalidEvents.length > 0) {
    return apiError(
      `Invalid events: ${invalidEvents.join(", ")}. Valid: ${VALID_EVENTS.join(", ")}`,
      400
    );
  }

  // Generate HMAC signing secret
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;

  const admin = createAdminClient();

  const { data: inserted, error: insertError } = await admin
    .from("kinetiks_webhooks")
    .insert({
      account_id: auth.account_id,
      url,
      secret,
      events,
      description: description ?? null,
    })
    .select("id, url, events, is_active, description, created_at")
    .single();

  if (insertError) {
    console.error("Failed to create webhook:", insertError.message);
    return apiError("Failed to create webhook", 500);
  }

  // Return the secret ONCE
  return apiSuccess({ ...inserted, secret });
}

/**
 * PATCH /api/webhooks
 * Update a webhook configuration.
 * Body: { webhook_id, url?, events?, is_active?, description? }
 */
export async function PATCH(request: Request) {
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

  const { data: existing } = await admin
    .from("kinetiks_webhooks")
    .select("id")
    .eq("id", webhook_id)
    .eq("account_id", auth.account_id)
    .single();

  if (!existing) return apiError("Webhook not found", 404);

  const updates: Record<string, unknown> = {};
  if ("url" in body && typeof body.url === "string") updates.url = body.url;
  if ("events" in body && Array.isArray(body.events)) updates.events = body.events;
  if ("is_active" in body && typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if ("description" in body) updates.description = body.description ?? null;

  if (Object.keys(updates).length === 0) {
    return apiError("No valid fields to update", 400);
  }

  const { data: updated, error: updateError } = await admin
    .from("kinetiks_webhooks")
    .update(updates)
    .eq("id", webhook_id)
    .select("id, url, events, is_active, description, created_at, updated_at")
    .single();

  if (updateError) return apiError("Failed to update webhook", 500);

  return apiSuccess(updated);
}

/**
 * DELETE /api/webhooks
 * Delete a webhook.
 * Body: { webhook_id }
 */
export async function DELETE(request: Request) {
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

  const { error: deleteError } = await admin
    .from("kinetiks_webhooks")
    .delete()
    .eq("id", webhook_id)
    .eq("account_id", auth.account_id);

  if (deleteError) return apiError("Failed to delete webhook", 500);

  return apiSuccess({ deleted: true, webhook_id });
}
