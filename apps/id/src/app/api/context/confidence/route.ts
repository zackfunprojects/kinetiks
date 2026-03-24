import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recalculateConfidence } from "@/lib/cortex/confidence";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * GET /api/context/confidence
 * Returns cached per-layer confidence scores and aggregate.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const { data, error: fetchError } = await admin
    .from("kinetiks_confidence")
    .select("org, products, voice, customers, narrative, competitive, market, brand, aggregate, updated_at")
    .eq("account_id", auth.account_id)
    .maybeSingle();

  if (fetchError) {
    console.error("Failed to fetch confidence:", fetchError.message);
    return apiError("Failed to fetch confidence scores", 500);
  }

  return apiSuccess(data);
}

/**
 * POST /api/context/confidence
 * Triggers a full confidence recalculation.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  const admin = createAdminClient();

  try {
    const scores = await recalculateConfidence(admin, auth.account_id);
    return apiSuccess(scores);
  } catch (e) {
    console.error("Confidence recalculation failed:", e);
    return apiError("Confidence recalculation failed", 500);
  }
}
