import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

interface RouteContext {
  params: { id: string };
}

export async function GET(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const { data, error: queryError } = await admin
    .from("hv_templates")
    .select("*")
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id)
    .single();

  if (queryError || !data) return apiError("Template not found", 404);
  return apiSuccess(data);
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  try {
    const body = await request.json();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.category !== undefined) updates.category = body.category;
    if (body.subject_template !== undefined) updates.subject_template = body.subject_template;
    if (body.body_template !== undefined) updates.body_template = body.body_template;
    if (body.style_preset_id !== undefined) updates.style_preset_id = body.style_preset_id;
    if (body.merge_fields !== undefined) updates.merge_fields = body.merge_fields;

    const { data, error: updateError } = await admin
      .from("hv_templates")
      .update(updates)
      .eq("id", params.id)
      .eq("kinetiks_id", auth.account_id)
      .select()
      .single();

    if (updateError) return apiError(updateError.message, 500);
    if (!data) return apiError("Template not found", 404);
    return apiSuccess(data);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Invalid request", 400);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const { error: deleteError } = await admin
    .from("hv_templates")
    .delete()
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id);

  if (deleteError) return apiError(deleteError.message, 500);
  return apiSuccess({ deleted: true });
}
