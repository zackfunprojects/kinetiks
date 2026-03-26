import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError, apiPaginated } from "@/lib/utils/api-response";

/**
 * GET /api/hv/mailboxes
 * List mailboxes for the authenticated account.
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
    .from("hv_mailboxes")
    .select("*", { count: "exact" })
    .eq("kinetiks_id", auth.account_id)
    .order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (queryError) return apiError(queryError.message, 500);
  return apiPaginated(data ?? [], page, perPage, count ?? 0);
}

/**
 * POST /api/hv/mailboxes
 * Create a new mailbox.
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

  if (!body.email || typeof body.email !== "string") {
    return apiError("email is required", 400);
  }
  if (!body.display_name || typeof body.display_name !== "string") {
    return apiError("display_name is required", 400);
  }

  const admin = createAdminClient();
  const { data, error: insertError } = await admin
    .from("hv_mailboxes")
    .insert({
      kinetiks_id: auth.account_id,
      email: body.email,
      display_name: body.display_name,
      provider: typeof body.provider === "string" ? body.provider : "google",
      warmup_status: "not_started",
      warmup_day: 0,
      warmup_daily_target: 5,
      daily_limit: 50,
      daily_sent_today: 0,
      reputation_score: 100,
      is_active: true,
    })
    .select("*")
    .single();

  if (insertError) return apiError(insertError.message, 500);
  return apiSuccess(data);
}
