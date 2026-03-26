import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { getContactById } from "@/lib/contacts/queries";

interface RouteContext {
  params: { id: string };
}

/**
 * GET /api/hv/contacts/[id]
 * Single contact with org and recent activities.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const { contact, contactError, activities } = await getContactById(
    admin,
    auth.account_id,
    params.id
  );

  if (contactError || !contact) {
    return apiError("Contact not found", 404);
  }

  return apiSuccess({ ...contact, activities });
}

/**
 * PATCH /api/hv/contacts/[id]
 * Update contact fields.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (parsed === null || typeof parsed !== "object") {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  // Allowlisted fields for update
  const allowedFields = [
    "first_name", "last_name", "email", "phone", "linkedin_url",
    "title", "seniority", "department", "notes", "tags",
  ];

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  const admin = createAdminClient();
  const { data, error: updateError } = await admin
    .from("hv_contacts")
    .update(updates)
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id)
    .select("*")
    .single();

  if (updateError) {
    return apiError(`Failed to update contact: ${updateError.message}`, 500);
  }

  if (!data) {
    return apiError("Contact not found", 404);
  }

  return apiSuccess(data);
}

/**
 * DELETE /api/hv/contacts/[id]
 * Soft-delete: suppress the contact and log to hv_suppressions.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Get the contact first (need email for suppression log)
  const { data: contact } = await admin
    .from("hv_contacts")
    .select("id, email, kinetiks_id")
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id)
    .single();

  if (!contact) {
    return apiError("Contact not found", 404);
  }

  // Suppress the contact
  const { error: suppressError } = await admin
    .from("hv_contacts")
    .update({
      suppressed: true,
      suppression_reason: "manually_suppressed",
      suppressed_at: now,
      updated_at: now,
    })
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id);

  if (suppressError) {
    return apiError(`Failed to suppress contact: ${suppressError.message}`, 500);
  }

  // Log to immutable suppressions table
  if (contact.email) {
    await admin.from("hv_suppressions").insert({
      kinetiks_id: auth.account_id,
      email: contact.email,
      type: "manual",
      reason: "manually_suppressed",
      source_app: "harvest",
    });
  }

  return apiSuccess({ suppressed: true });
}
