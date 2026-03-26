import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

interface RouteParams {
  params: { id: string };
}

/**
 * PATCH /api/hv/mailboxes/:id
 * Update mailbox fields: is_active, daily_limit, signature_html, warmup_status.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);
  if (body.daily_limit !== undefined) {
    const limit = Number(body.daily_limit);
    if (Number.isNaN(limit) || limit < 0) return apiError("daily_limit must be a non-negative number", 400);
    updates.daily_limit = limit;
  }
  if (body.signature_html !== undefined) updates.signature_html = body.signature_html;
  if (body.warmup_status !== undefined) {
    const validStatuses = ["not_started", "warming", "warm", "paused"];
    if (!validStatuses.includes(body.warmup_status as string)) {
      return apiError(`Invalid warmup_status. Must be one of: ${validStatuses.join(", ")}`, 400);
    }
    updates.warmup_status = body.warmup_status;
  }

  const admin = createAdminClient();
  const { data, error: updateError } = await admin
    .from("hv_mailboxes")
    .update(updates)
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id)
    .select("*")
    .single();

  if (updateError) return apiError(updateError.message, 500);
  if (!data) return apiError("Mailbox not found", 404);
  return apiSuccess(data);
}

/**
 * DELETE /api/hv/mailboxes/:id
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const { error: deleteError } = await admin
    .from("hv_mailboxes")
    .delete()
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id);

  if (deleteError) return apiError(deleteError.message, 500);
  return apiSuccess({ deleted: true });
}
