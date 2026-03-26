import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

interface RouteContext {
  params: { id: string };
}

/**
 * GET /api/hv/emails/[id]
 * Fetch a single email draft.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const { data, error: queryError } = await admin
    .from("hv_emails")
    .select("*, contact:hv_contacts!contact_id(id, first_name, last_name, email, title)")
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id)
    .maybeSingle();

  if (queryError) {
    return apiError(`Failed to fetch email: ${queryError.message}`, 500);
  }
  if (!data) {
    return apiError("Email not found", 404);
  }

  return apiSuccess(data);
}

/**
 * PATCH /api/hv/emails/[id]
 * Update an email draft.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
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

  const allowedFields = [
    "subject", "body", "body_plain", "status", "scheduled_at",
    "sentinel_verdict", "sentinel_flags", "sentinel_quality_score",
    "style_config", "research_brief",
  ];

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let hasUpdates = false;
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
      hasUpdates = true;
    }
  }

  if (!hasUpdates) {
    return apiError("No valid fields to update", 400);
  }

  const admin = createAdminClient();
  const { data, error: updateError } = await admin
    .from("hv_emails")
    .update(updates)
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id)
    .select("*")
    .single();

  if (updateError) {
    return apiError(`Failed to update email: ${updateError.message}`, 500);
  }

  if (!data) {
    return apiError("Email not found", 404);
  }

  return apiSuccess(data);
}
