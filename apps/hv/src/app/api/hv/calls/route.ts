import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError, apiPaginated } from "@/lib/utils/api-response";
import type { CallStatus } from "@/types/calls";

const VALID_STATUSES: CallStatus[] = ["scheduled", "in_progress", "completed", "failed", "cancelled"];

/**
 * GET /api/hv/calls
 * List calls with optional status filter and pagination.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const rawPage = parseInt(url.searchParams.get("page") ?? "1", 10);
  const rawPerPage = parseInt(url.searchParams.get("per_page") ?? "25", 10);
  const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage);
  const perPage = Number.isNaN(rawPerPage) ? 25 : Math.min(100, Math.max(1, rawPerPage));

  let query = admin
    .from("hv_calls")
    .select("*", { count: "exact" })
    .eq("kinetiks_id", auth.account_id)
    .order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (status && VALID_STATUSES.includes(status as CallStatus)) {
    query = query.eq("status", status);
  }

  const { data, error: queryError, count } = await query;
  if (queryError) return apiError(queryError.message, 500);
  return apiPaginated(data ?? [], page, perPage, count ?? 0);
}

/**
 * POST /api/hv/calls
 * Create / log a call.
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

  if (!body.contact_id || typeof body.contact_id !== "string") {
    return apiError("contact_id is required", 400);
  }
  if (!body.phone_from || typeof body.phone_from !== "string") {
    return apiError("phone_from is required", 400);
  }
  if (!body.phone_to || typeof body.phone_to !== "string") {
    return apiError("phone_to is required", 400);
  }

  const admin = createAdminClient();
  const { data, error: insertError } = await admin
    .from("hv_calls")
    .insert({
      kinetiks_id: auth.account_id,
      contact_id: body.contact_id,
      org_id: body.org_id ?? null,
      campaign_id: body.campaign_id ?? null,
      sequence_id: body.sequence_id ?? null,
      step_number: body.step_number ?? null,
      phone_from: body.phone_from,
      phone_to: body.phone_to,
      call_type: typeof body.call_type === "string" ? body.call_type : "follow_up",
      status: typeof body.status === "string" && VALID_STATUSES.includes(body.status as CallStatus)
        ? body.status
        : "completed",
      duration_seconds: typeof body.duration_seconds === "number" ? body.duration_seconds : 0,
      transcript: typeof body.transcript === "string" ? body.transcript : null,
      key_moments: Array.isArray(body.notes) ? body.notes : [],
      outcome: typeof body.outcome === "string" ? body.outcome : null,
    })
    .select("*")
    .single();

  if (insertError) return apiError(insertError.message, 500);
  return apiSuccess(data);
}
