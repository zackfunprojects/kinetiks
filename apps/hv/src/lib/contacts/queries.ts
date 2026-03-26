import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactFilters, ContactSort } from "@/types/contacts";

/**
 * Build a paginated, filtered, sorted contact list query.
 * Joins hv_organizations for company name/domain display.
 */
export async function buildContactListQuery(
  supabase: SupabaseClient,
  accountId: string,
  filters: ContactFilters,
  sort: ContactSort,
  page: number,
  perPage: number
) {
  let query = supabase
    .from("hv_contacts")
    .select(
      `*, organization:hv_organizations!org_id(id, name, domain, industry, employee_count_range)`,
      { count: "exact" }
    )
    .eq("kinetiks_id", accountId);

  // Search across name, email, and org name
  if (filters.q) {
    const term = `%${filters.q}%`;
    query = query.or(
      `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`
    );
  }

  // Exact filters
  if (filters.source) {
    query = query.eq("source", filters.source);
  }
  if (filters.seniority) {
    query = query.eq("seniority", filters.seniority);
  }
  if (filters.verification_grade) {
    query = query.eq("verification_grade", filters.verification_grade);
  }

  // Suppressed filter (default: hide suppressed)
  if (filters.suppressed === true) {
    query = query.eq("suppressed", true);
  } else if (filters.suppressed === false || filters.suppressed === undefined) {
    query = query.eq("suppressed", false);
  }

  // Tag filter (contains all specified tags)
  if (filters.tags && filters.tags.length > 0) {
    query = query.contains("tags", filters.tags);
  }

  // Score range
  if (filters.score_min !== undefined) {
    query = query.gte("lead_score", filters.score_min);
  }
  if (filters.score_max !== undefined) {
    query = query.lte("lead_score", filters.score_max);
  }

  // Sorting
  const ascending = sort.direction === "asc";
  query = query.order(sort.field, { ascending });

  // Pagination
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query.range(from, to);

  return query;
}

/**
 * Get a single contact by ID with full org data and recent activities.
 */
export async function getContactById(
  supabase: SupabaseClient,
  accountId: string,
  contactId: string
) {
  const contactQuery = supabase
    .from("hv_contacts")
    .select(`*, organization:hv_organizations!org_id(*)`)
    .eq("kinetiks_id", accountId)
    .eq("id", contactId)
    .single();

  const activitiesQuery = supabase
    .from("hv_activities")
    .select("*")
    .eq("kinetiks_id", accountId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(20);

  const [contactResult, activitiesResult] = await Promise.all([
    contactQuery,
    activitiesQuery,
  ]);

  return {
    contact: contactResult.data,
    contactError: contactResult.error,
    activities: activitiesResult.data ?? [],
    activitiesError: activitiesResult.error,
  };
}

/**
 * Get distinct source values for filter dropdown.
 */
export async function getDistinctValues(
  supabase: SupabaseClient,
  accountId: string
) {
  const [sourcesResult, tagsResult] = await Promise.all([
    supabase
      .from("hv_contacts")
      .select("source")
      .eq("kinetiks_id", accountId)
      .eq("suppressed", false),
    supabase
      .from("hv_contacts")
      .select("tags")
      .eq("kinetiks_id", accountId)
      .eq("suppressed", false)
      .not("tags", "eq", "{}"),
  ]);

  // Extract unique sources
  const sources = Array.from(
    new Set(
      (sourcesResult.data ?? [])
        .map((r: { source: string }) => r.source)
        .filter(Boolean)
    )
  );

  // Extract unique tags from all contacts
  const tagSet = new Set<string>();
  for (const row of tagsResult.data ?? []) {
    for (const tag of (row as { tags: string[] }).tags ?? []) {
      tagSet.add(tag);
    }
  }

  return {
    sources: sources as string[],
    tags: Array.from(tagSet).sort(),
  };
}
