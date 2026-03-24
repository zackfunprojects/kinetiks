import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveProposal } from "@/lib/cortex/resolve-proposal";
import { apiSuccess, apiError, apiPaginated } from "@/lib/utils/api-response";
import { NextRequest } from "next/server";

/**
 * GET /api/approvals
 * List escalated proposals for the authenticated account.
 * Query: ?status=escalated (default) | accepted | declined | all
 *        &source_app=dark_madder
 *        &target_layer=voice
 *        &page=1&per_page=20
 */
export async function GET(request: NextRequest) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const status = params.get("status") ?? "escalated";
  const sourceApp = params.get("source_app");
  const targetLayer = params.get("target_layer");
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10));
  const perPage = Math.min(100, Math.max(1, parseInt(params.get("per_page") ?? "20", 10)));

  const admin = createAdminClient();

  let query = admin
    .from("kinetiks_proposals")
    .select("*", { count: "exact" })
    .eq("account_id", auth.account_id)
    .order("submitted_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (sourceApp) {
    query = query.eq("source_app", sourceApp);
  }
  if (targetLayer) {
    query = query.eq("target_layer", targetLayer);
  }

  const { data: proposals, count, error: fetchError } = await query;

  if (fetchError) {
    console.error("Failed to fetch approvals:", fetchError.message);
    return apiError("Failed to fetch approvals", 500);
  }

  return apiPaginated(proposals ?? [], page, perPage, count ?? 0);
}

/**
 * POST /api/approvals
 * Resolve an escalated proposal.
 * Body: { proposal_id, decision: 'accept' | 'decline', reason? }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const { proposal_id, decision, reason } = body as {
    proposal_id?: string;
    decision?: string;
    reason?: string;
  };

  if (!proposal_id || typeof proposal_id !== "string") {
    return apiError("Missing proposal_id", 400);
  }

  if (!decision || !["accept", "decline"].includes(decision)) {
    return apiError("Invalid decision. Must be 'accept' or 'decline'", 400);
  }

  const admin = createAdminClient();

  const result = await resolveProposal(
    admin,
    auth.account_id,
    proposal_id,
    decision as "accept" | "decline",
    auth.auth_method === "api_key" ? "api_key" : "user",
    reason
  );

  if (result.error) {
    return apiError(result.error, 404);
  }

  return apiSuccess(result);
}
