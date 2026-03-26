import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError, apiPaginated } from "@/lib/utils/api-response";

export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get("per_page") ?? "25", 10)));

  let query = admin
    .from("hv_sequences")
    .select("*", { count: "exact" })
    .eq("kinetiks_id", auth.account_id)
    .order("updated_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (status) query = query.eq("status", status);
  if (q) query = query.ilike("name", `%${q}%`);

  const { data, error: queryError, count } = await query;
  if (queryError) return apiError(queryError.message, 500);

  return apiPaginated(data ?? [], page, perPage, count ?? 0);
}

export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const body = await request.json();

  if (!body || typeof body !== "object" || !body.name) {
    return apiError("name is required", 400);
  }

  const { data, error: insertError } = await admin
    .from("hv_sequences")
    .insert({
      kinetiks_id: auth.account_id,
      name: body.name,
      steps: body.steps ?? [],
      status: "draft",
      stats: {},
    })
    .select()
    .single();

  if (insertError) return apiError(insertError.message, 500);
  return apiSuccess(data);
}
