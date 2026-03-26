import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError, apiPaginated } from "@/lib/utils/api-response";

/**
 * GET /api/hv/emails
 * List email drafts with optional filters.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const url = new URL(request.url);
  const rawPage = parseInt(url.searchParams.get("page") ?? "1", 10);
  const rawPerPage = parseInt(url.searchParams.get("per_page") ?? "25", 10);
  const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage);
  const perPage = Number.isNaN(rawPerPage) ? 25 : Math.min(100, Math.max(1, rawPerPage));
  const status = url.searchParams.get("status");
  const contactId = url.searchParams.get("contact_id");

  const admin = createAdminClient();

  let query = admin
    .from("hv_emails")
    .select(
      "*, contact:hv_contacts!contact_id(id, first_name, last_name, email)",
      { count: "exact" }
    )
    .eq("kinetiks_id", auth.account_id)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (contactId) query = query.eq("contact_id", contactId);

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query.range(from, to);

  const { data, count, error: queryError } = await query;

  if (queryError) {
    return apiError(`Failed to fetch emails: ${queryError.message}`, 500);
  }

  return apiPaginated(data ?? [], page, perPage, count ?? 0);
}

/**
 * POST /api/hv/emails
 * Save a new email draft.
 */
export async function POST(request: Request) {
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

  if (!body.contact_id) return apiError("contact_id is required", 400);
  if (!body.subject) return apiError("subject is required", 400);
  if (!body.body) return apiError("body is required", 400);

  const admin = createAdminClient();

  const { data, error: insertError } = await admin
    .from("hv_emails")
    .insert({
      kinetiks_id: auth.account_id,
      contact_id: body.contact_id,
      cc_contact_id: body.cc_contact_id ?? null,
      org_id: body.org_id ?? null,
      subject: body.subject,
      body: body.body,
      body_plain: body.body_plain ?? null,
      research_brief: body.research_brief ?? null,
      style_config: body.style_config ?? null,
      sentinel_verdict: body.sentinel_verdict ?? null,
      sentinel_flags: body.sentinel_flags ?? null,
      sentinel_quality_score: body.sentinel_quality_score ?? null,
      status: body.status ?? "draft",
    })
    .select("*")
    .single();

  if (insertError) {
    return apiError(`Failed to save email: ${insertError.message}`, 500);
  }

  return apiSuccess(data);
}
