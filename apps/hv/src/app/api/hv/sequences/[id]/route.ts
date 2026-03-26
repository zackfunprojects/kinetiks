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
    .from("hv_sequences")
    .select("*")
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id)
    .single();

  if (queryError || !data) return apiError("Sequence not found", 404);
  return apiSuccess(data);
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const body = await request.json();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.steps !== undefined) updates.steps = body.steps;
  if (body.status !== undefined) {
    const validStatuses = ["draft", "active", "paused", "archived"];
    if (!validStatuses.includes(body.status)) {
      return apiError(`Invalid status. Must be one of: ${validStatuses.join(", ")}`, 400);
    }
    updates.status = body.status;
  }

  const { data, error: updateError } = await admin
    .from("hv_sequences")
    .update(updates)
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id)
    .select()
    .single();

  if (updateError) return apiError(updateError.message, 500);
  if (!data) return apiError("Sequence not found", 404);
  return apiSuccess(data);
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const { error: deleteError } = await admin
    .from("hv_sequences")
    .delete()
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id);

  if (deleteError) return apiError(deleteError.message, 500);
  return apiSuccess({ deleted: true });
}
