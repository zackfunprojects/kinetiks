import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

interface RouteParams {
  params: { id: string };
}

/**
 * GET /api/hv/calls/:id
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const { data, error: queryError } = await admin
    .from("hv_calls")
    .select("*")
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id)
    .single();

  if (queryError || !data) return apiError("Call not found", 404);
  return apiSuccess(data);
}

/**
 * PATCH /api/hv/calls/:id
 * Update status, outcome, duration_seconds, transcript, key_moments.
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

  if (body.status !== undefined) {
    const validStatuses = ["scheduled", "in_progress", "completed", "failed", "cancelled"];
    if (!validStatuses.includes(body.status as string)) {
      return apiError(`Invalid status. Must be one of: ${validStatuses.join(", ")}`, 400);
    }
    updates.status = body.status;
  }
  if (body.outcome !== undefined) {
    const validOutcomes = ["connected", "voicemail", "no_answer", "busy", "wrong_number"];
    if (body.outcome !== null && !validOutcomes.includes(body.outcome as string)) {
      return apiError(`Invalid outcome. Must be one of: ${validOutcomes.join(", ")}`, 400);
    }
    updates.outcome = body.outcome;
  }
  if (body.duration_seconds !== undefined) {
    const dur = Number(body.duration_seconds);
    if (Number.isNaN(dur) || dur < 0) return apiError("duration_seconds must be a non-negative number", 400);
    updates.duration_seconds = dur;
  }
  if (body.transcript !== undefined) updates.transcript = body.transcript;
  if (body.key_moments !== undefined) {
    if (!Array.isArray(body.key_moments)) return apiError("key_moments must be an array", 400);
    updates.key_moments = body.key_moments;
  }

  const admin = createAdminClient();
  const { data, error: updateError } = await admin
    .from("hv_calls")
    .update(updates)
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id)
    .select("*")
    .single();

  if (updateError) return apiError(updateError.message, 500);
  if (!data) return apiError("Call not found", 404);
  return apiSuccess(data);
}
