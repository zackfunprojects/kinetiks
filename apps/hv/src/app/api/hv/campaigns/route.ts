import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError, apiPaginated } from "@/lib/utils/api-response";
import type { CampaignStatus } from "@/types/campaigns";

const VALID_STATUSES: CampaignStatus[] = ["draft", "active", "paused", "completed"];

/**
 * GET /api/hv/campaigns
 * List campaigns with optional status/q filters and pagination.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q");
  const rawPage = parseInt(url.searchParams.get("page") ?? "1", 10);
  const rawPerPage = parseInt(url.searchParams.get("per_page") ?? "25", 10);
  const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage);
  const perPage = Number.isNaN(rawPerPage) ? 25 : Math.min(100, Math.max(1, rawPerPage));

  let query = admin
    .from("hv_campaigns")
    .select("*, hv_sequences(name)", { count: "exact" })
    .eq("kinetiks_id", auth.account_id)
    .order("updated_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (status && VALID_STATUSES.includes(status as CampaignStatus)) {
    query = query.eq("status", status);
  }
  if (q) query = query.ilike("name", `%${q}%`);

  const { data, error: queryError, count } = await query;
  if (queryError) return apiError(queryError.message, 500);

  // Flatten the joined sequence name
  const campaigns = (data ?? []).map((row: Record<string, unknown>) => {
    const seq = row.hv_sequences as { name: string } | null;
    return {
      ...row,
      sequence_name: seq?.name ?? null,
      hv_sequences: undefined,
    };
  });

  return apiPaginated(campaigns, page, perPage, count ?? 0);
}

/**
 * POST /api/hv/campaigns
 * Create a new campaign.
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

  const admin = createAdminClient();

  const { data, error: insertError } = await admin
    .from("hv_campaigns")
    .insert({
      kinetiks_id: auth.account_id,
      name: body.name,
      sequence_id: body.sequence_id ?? null,
      prospect_filter: body.prospect_filter ?? {},
      status: "draft",
      stats: { enrolled: 0, sent: 0, opened: 0, replied: 0, bounced: 0 },
      playbook_type: null,
    })
    .select("*")
    .single();

  if (insertError) return apiError(insertError.message, 500);
  return apiSuccess(data);
}
