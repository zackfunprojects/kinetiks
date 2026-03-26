import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError, apiPaginated } from "@/lib/utils/api-response";

/**
 * GET /api/hv/webhooks
 * List webhook configurations for the authenticated account.
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
    .from("hv_webhook_configs")
    .select("*", { count: "exact" })
    .eq("kinetiks_id", auth.account_id)
    .order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (queryError) return apiError(queryError.message, 500);
  return apiPaginated(data ?? [], page, perPage, count ?? 0);
}

/**
 * POST /api/hv/webhooks
 * Create a new webhook configuration with an auto-generated secret.
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

  if (!body.url || typeof body.url !== "string") {
    return apiError("url is required", 400);
  }
  if (!body.events || !Array.isArray(body.events) || body.events.length === 0) {
    return apiError("events must be a non-empty array of strings", 400);
  }

  const secret = crypto.randomUUID();

  const admin = createAdminClient();
  const { data, error: insertError } = await admin
    .from("hv_webhook_configs")
    .insert({
      kinetiks_id: auth.account_id,
      url: body.url,
      events: body.events,
      secret,
      is_active: true,
      consecutive_failures: 0,
    })
    .select("*")
    .single();

  if (insertError) return apiError(insertError.message, 500);
  return apiSuccess(data);
}
