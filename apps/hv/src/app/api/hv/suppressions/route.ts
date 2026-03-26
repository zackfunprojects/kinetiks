import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError, apiPaginated } from "@/lib/utils/api-response";

/**
 * GET /api/hv/suppressions
 * List suppressions with pagination.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const url = new URL(request.url);
  const rawPage = parseInt(url.searchParams.get("page") ?? "1", 10);
  const rawPerPage = parseInt(url.searchParams.get("per_page") ?? "25", 10);
  const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage);
  const perPage = Number.isNaN(rawPerPage) ? 25 : Math.min(100, Math.max(1, rawPerPage));

  const { data, error: queryError, count } = await admin
    .from("hv_suppressions")
    .select("*", { count: "exact" })
    .eq("kinetiks_id", auth.account_id)
    .order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (queryError) return apiError(queryError.message, 500);
  return apiPaginated(data ?? [], page, perPage, count ?? 0);
}

/**
 * POST /api/hv/suppressions
 * Create a new suppression entry. At least one of email, phone, or domain required.
 */
export async function POST(request: Request) {
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

  const email = typeof body.email === "string" ? body.email.trim() : null;
  const phone = typeof body.phone === "string" ? body.phone.trim() : null;
  const domain = typeof body.domain === "string" ? body.domain.trim() : null;

  if (!email && !phone && !domain) {
    return apiError("At least one of email, phone, or domain is required", 400);
  }

  if (!body.type || typeof body.type !== "string") {
    return apiError("type is required", 400);
  }

  const admin = createAdminClient();
  const { data, error: insertError } = await admin
    .from("hv_suppressions")
    .insert({
      kinetiks_id: auth.account_id,
      email: email || null,
      phone: phone || null,
      domain: domain || null,
      type: body.type,
      reason: typeof body.reason === "string" ? body.reason : null,
      source_app: "harvest",
    })
    .select("*")
    .single();

  if (insertError) return apiError(insertError.message, 500);
  return apiSuccess(data);
}
