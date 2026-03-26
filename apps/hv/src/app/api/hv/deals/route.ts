import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError, apiPaginated } from "@/lib/utils/api-response";
import { buildDealListQuery, fetchDealsForKanban, getPipelineMetrics } from "@/lib/pipeline/queries";
import type { DealFilters, DealSort, DealStage, DEAL_STAGES, HvDeal } from "@/types/pipeline";

const VALID_STAGES: DealStage[] = ["prospecting", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"];

/**
 * GET /api/hv/deals
 * List deals. ?view=kanban returns grouped by stage; ?view=table returns paginated.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "kanban";
  const admin = createAdminClient();

  if (view === "kanban") {
    const [dealsResult, metrics] = await Promise.all([
      fetchDealsForKanban(admin, auth.account_id),
      getPipelineMetrics(admin, auth.account_id),
    ]);

    if (dealsResult.error) {
      return apiError(`Failed to fetch deals: ${dealsResult.error.message}`, 500);
    }

    // Group deals by stage
    const dealsByStage: Record<DealStage, HvDeal[]> = {
      prospecting: [],
      qualified: [],
      proposal: [],
      negotiation: [],
      closed_won: [],
      closed_lost: [],
    };

    for (const deal of (dealsResult.data ?? []) as HvDeal[]) {
      if (dealsByStage[deal.stage]) {
        dealsByStage[deal.stage].push(deal);
      }
    }

    return apiSuccess({ deals_by_stage: dealsByStage, metrics });
  }

  // Table view - paginated
  const rawPage = parseInt(url.searchParams.get("page") ?? "1", 10);
  const rawPerPage = parseInt(url.searchParams.get("per_page") ?? "25", 10);
  const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage);
  const perPage = Number.isNaN(rawPerPage) ? 25 : Math.min(100, Math.max(1, rawPerPage));

  const filters: DealFilters = {};
  const q = url.searchParams.get("q");
  if (q) filters.q = q;
  const stage = url.searchParams.get("stage");
  if (stage && VALID_STAGES.includes(stage as DealStage)) filters.stage = stage as DealStage;
  const contactId = url.searchParams.get("contact_id");
  if (contactId) filters.contact_id = contactId;

  const sortBy = url.searchParams.get("sort_by") ?? "created_at";
  const sortDir = url.searchParams.get("sort_dir") ?? "desc";
  const validSorts = ["name", "value", "created_at", "updated_at"];
  const sort: DealSort = {
    field: (validSorts.includes(sortBy) ? sortBy : "created_at") as DealSort["field"],
    direction: sortDir === "asc" ? "asc" : "desc",
  };

  const { data, count, error: queryError } = await buildDealListQuery(admin, auth.account_id, filters, sort, page, perPage);

  if (queryError) {
    return apiError(`Failed to fetch deals: ${queryError.message}`, 500);
  }

  return apiPaginated(data ?? [], page, perPage, count ?? 0);
}

/**
 * POST /api/hv/deals
 * Create a new deal.
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

  if (!body.name || typeof body.name !== "string") {
    return apiError("name is required", 400);
  }

  const stage = (body.stage as string) ?? "prospecting";
  if (!VALID_STAGES.includes(stage as DealStage)) {
    return apiError(`Invalid stage: ${stage}`, 400);
  }

  // Validate currency code
  let currency = "USD";
  if (body.currency && typeof body.currency === "string") {
    const normalized = body.currency.toUpperCase().trim();
    try {
      new Intl.NumberFormat(undefined, { style: "currency", currency: normalized });
      currency = normalized;
    } catch {
      return apiError(`Invalid currency code: ${body.currency}`, 400);
    }
  }

  const admin = createAdminClient();

  const { data, error: insertError } = await admin
    .from("hv_deals")
    .insert({
      kinetiks_id: auth.account_id,
      name: body.name,
      contact_id: body.contact_id ?? null,
      org_id: body.org_id ?? null,
      stage,
      value: typeof body.value === "number" ? body.value : null,
      currency,
      notes: body.notes ?? null,
    })
    .select("*")
    .single();

  if (insertError) {
    return apiError(`Failed to create deal: ${insertError.message}`, 500);
  }

  // Log activity
  const { error: activityError } = await admin.from("hv_activities").insert({
    kinetiks_id: auth.account_id,
    deal_id: data.id,
    contact_id: body.contact_id ?? null,
    org_id: body.org_id ?? null,
    type: "deal_created",
    content: { detail: `Deal "${body.name}" created` },
    source_app: "harvest",
  });
  if (activityError) {
    console.error("Failed to log deal creation activity:", activityError.message);
  }

  return apiSuccess(data);
}
