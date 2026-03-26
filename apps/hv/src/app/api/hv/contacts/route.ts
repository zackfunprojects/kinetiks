import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError, apiPaginated } from "@/lib/utils/api-response";
import { buildContactListQuery } from "@/lib/contacts/queries";
import type { ContactFilters, ContactSort } from "@/types/contacts";

/**
 * GET /api/hv/contacts
 * List contacts with filtering, sorting, and pagination.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get("per_page") ?? "25", 10)));

  const filters: ContactFilters = {};
  const q = url.searchParams.get("q");
  if (q) filters.q = q;

  const source = url.searchParams.get("source");
  if (source) filters.source = source;

  const seniority = url.searchParams.get("seniority");
  if (seniority) filters.seniority = seniority;

  const verificationGrade = url.searchParams.get("verification_grade");
  if (verificationGrade) filters.verification_grade = verificationGrade;

  const tags = url.searchParams.get("tags");
  if (tags) filters.tags = tags.split(",").map((t) => t.trim()).filter(Boolean);

  const suppressed = url.searchParams.get("suppressed");
  if (suppressed === "true") filters.suppressed = true;
  else if (suppressed === "all") filters.suppressed = undefined;
  // default: hide suppressed (suppressed = false)

  const scoreMin = url.searchParams.get("score_min");
  if (scoreMin) {
    const parsed = parseInt(scoreMin, 10);
    if (!Number.isNaN(parsed)) filters.score_min = parsed;
  }

  const scoreMax = url.searchParams.get("score_max");
  if (scoreMax) {
    const parsed = parseInt(scoreMax, 10);
    if (!Number.isNaN(parsed)) filters.score_max = parsed;
  }

  const sortBy = url.searchParams.get("sort_by") ?? "lead_score";
  const sortDir = url.searchParams.get("sort_dir") ?? "desc";
  const validSortFields = ["first_name", "lead_score", "fit_score", "created_at", "title", "email"];
  const sort: ContactSort = {
    field: (validSortFields.includes(sortBy) ? sortBy : "lead_score") as ContactSort["field"],
    direction: sortDir === "asc" ? "asc" : "desc",
  };

  const admin = createAdminClient();
  const { data, count, error: queryError } = await buildContactListQuery(
    admin,
    auth.account_id,
    filters,
    sort,
    page,
    perPage
  );

  if (queryError) {
    return apiError(`Failed to fetch contacts: ${queryError.message}`, 500);
  }

  return apiPaginated(data ?? [], page, perPage, count ?? 0);
}

/**
 * POST /api/hv/contacts
 * Create a contact manually.
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

  // Require at least a name or email
  if (!body.first_name && !body.last_name && !body.email) {
    return apiError("At least first_name, last_name, or email is required", 400);
  }

  const admin = createAdminClient();
  const { data, error: insertError } = await admin
    .from("hv_contacts")
    .insert({
      kinetiks_id: auth.account_id,
      org_id: body.org_id ?? null,
      first_name: body.first_name ?? null,
      last_name: body.last_name ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      linkedin_url: body.linkedin_url ?? null,
      title: body.title ?? null,
      seniority: body.seniority ?? null,
      department: body.department ?? null,
      source: "manual",
      notes: body.notes ?? null,
      tags: Array.isArray(body.tags) ? body.tags : [],
    })
    .select("*")
    .single();

  if (insertError) {
    return apiError(`Failed to create contact: ${insertError.message}`, 500);
  }

  return apiSuccess(data);
}
