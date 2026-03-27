import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError, apiPaginated } from "@/lib/utils/api-response";

/**
 * GET /api/hv/templates
 * List email templates with optional category filter.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get("per_page") ?? "50", 10)));

  let query = admin
    .from("hv_templates")
    .select("*", { count: "exact" })
    .eq("kinetiks_id", auth.account_id)
    .order("updated_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (category) query = query.eq("category", category);

  const { data, error: queryError, count } = await query;
  if (queryError) return apiError(queryError.message, 500);

  return apiPaginated(data ?? [], page, perPage, count ?? 0);
}

/**
 * POST /api/hv/templates
 * Create a new template. Can be manual or AI-generated.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  try {
    const body = await request.json();

    if (!body.name) return apiError("name is required", 400);

    const { data, error: insertError } = await admin
      .from("hv_templates")
      .insert({
        kinetiks_id: auth.account_id,
        name: body.name,
        category: body.category ?? "cold_outreach",
        subject_template: body.subject_template ?? "",
        body_template: body.body_template ?? "",
        style_preset_id: body.style_preset_id ?? null,
        merge_fields: body.merge_fields ?? [],
        is_ai_generated: body.is_ai_generated ?? false,
        performance: { times_used: 0 },
      })
      .select()
      .single();

    if (insertError) return apiError(insertError.message, 500);
    return apiSuccess(data);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Invalid request", 400);
  }
}
