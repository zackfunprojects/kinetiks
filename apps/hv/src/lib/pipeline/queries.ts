import type { SupabaseClient } from "@supabase/supabase-js";
import type { DealFilters, DealSort, DealStage, HvDeal, PipelineMetrics, DEAL_STAGES } from "@/types/pipeline";

const CONTACT_SELECT = "id, first_name, last_name, email, title";
const ORG_SELECT = "id, name, domain";
const DEAL_JOIN = `*, contact:hv_contacts!contact_id(${CONTACT_SELECT}), organization:hv_organizations!org_id(${ORG_SELECT})`;

/**
 * Build a paginated, filtered, sorted deal list query (for table view).
 */
export async function buildDealListQuery(
  supabase: SupabaseClient,
  accountId: string,
  filters: DealFilters,
  sort: DealSort,
  page: number,
  perPage: number
) {
  let query = supabase
    .from("hv_deals")
    .select(DEAL_JOIN, { count: "exact" })
    .eq("kinetiks_id", accountId);

  if (filters.q) {
    query = query.ilike("name", `%${filters.q}%`);
  }
  if (filters.stage) {
    query = query.eq("stage", filters.stage);
  }
  if (filters.contact_id) {
    query = query.eq("contact_id", filters.contact_id);
  }
  if (filters.org_id) {
    query = query.eq("org_id", filters.org_id);
  }
  if (filters.value_min !== undefined) {
    query = query.gte("value", filters.value_min);
  }
  if (filters.value_max !== undefined) {
    query = query.lte("value", filters.value_max);
  }

  query = query.order(sort.field, { ascending: sort.direction === "asc" });

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query.range(from, to);

  return query;
}

/**
 * Fetch all active (non-closed) deals for Kanban view.
 * Returns all deals ordered by updated_at desc.
 */
export async function fetchDealsForKanban(
  supabase: SupabaseClient,
  accountId: string
) {
  return supabase
    .from("hv_deals")
    .select(DEAL_JOIN)
    .eq("kinetiks_id", accountId)
    .order("updated_at", { ascending: false });
}

/**
 * Fetch a single deal with full contact, org, and recent activities.
 */
export async function getDealById(
  supabase: SupabaseClient,
  accountId: string,
  dealId: string
) {
  const dealQuery = supabase
    .from("hv_deals")
    .select(DEAL_JOIN)
    .eq("kinetiks_id", accountId)
    .eq("id", dealId)
    .single();

  const activitiesQuery = supabase
    .from("hv_activities")
    .select("*")
    .eq("kinetiks_id", accountId)
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(20);

  const [dealResult, activitiesResult] = await Promise.all([
    dealQuery,
    activitiesQuery,
  ]);

  return {
    deal: dealResult.data as HvDeal | null,
    dealError: dealResult.error,
    activities: activitiesResult.data ?? [],
    activitiesError: activitiesResult.error,
  };
}

/**
 * Compute pipeline metrics from all deals.
 */
export async function getPipelineMetrics(
  supabase: SupabaseClient,
  accountId: string
): Promise<PipelineMetrics> {
  const { data: deals, error } = await supabase
    .from("hv_deals")
    .select("stage, value, created_at, closed_at")
    .eq("kinetiks_id", accountId);

  if (error) {
    throw new Error(`Failed to fetch pipeline metrics: ${error.message}`);
  }

  const stageInit = () => ({ count: 0, value: 0 });
  const byStage: Record<string, { count: number; value: number }> = {
    prospecting: stageInit(),
    qualified: stageInit(),
    proposal: stageInit(),
    negotiation: stageInit(),
    closed_won: stageInit(),
    closed_lost: stageInit(),
  };

  let totalValue = 0;
  let totalDeals = 0;
  let totalAgeDays = 0;
  let openDeals = 0;
  let wonThisMonthCount = 0;
  let wonThisMonthValue = 0;

  const now = Date.now();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  for (const deal of deals ?? []) {
    const stage = deal.stage as DealStage;
    const value = (deal.value as number) ?? 0;

    if (byStage[stage]) {
      byStage[stage].count++;
      byStage[stage].value += value;
    }

    totalDeals++;
    totalValue += value;

    if (stage !== "closed_won" && stage !== "closed_lost") {
      const age = Math.floor((now - new Date(deal.created_at as string).getTime()) / (1000 * 60 * 60 * 24));
      totalAgeDays += age;
      openDeals++;
    }

    if (stage === "closed_won" && deal.closed_at && new Date(deal.closed_at as string) >= monthStart) {
      wonThisMonthCount++;
      wonThisMonthValue += value;
    }
  }

  return {
    total_deals: totalDeals,
    total_value: totalValue,
    deals_by_stage: byStage as PipelineMetrics["deals_by_stage"],
    avg_age_days: openDeals > 0 ? Math.round(totalAgeDays / openDeals) : 0,
    won_this_month: { count: wonThisMonthCount, value: wonThisMonthValue },
  };
}
