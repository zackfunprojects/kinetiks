import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { executeStep } from "@/lib/sequences/executor";
import type { HvEnrollment } from "@/types/execution";

/**
 * POST /api/hv/sequences/execute
 *
 * Internal-only endpoint called by the sequence-cron Edge Function.
 * Executes the current step for a given enrollment.
 *
 * Auth: INTERNAL_SERVICE_SECRET bearer token (not user auth).
 * Body: { enrollment_id: string }
 */
export async function POST(request: Request) {
  // Verify internal service auth
  const authHeader = request.headers.get("authorization");
  const expected = process.env.INTERNAL_SERVICE_SECRET;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return apiError("Unauthorized", 401);
  }

  let body: { enrollment_id?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.enrollment_id) {
    return apiError("enrollment_id is required", 400);
  }

  const admin = createAdminClient();

  // Load enrollment
  const { data: enrollment, error: loadError } = await admin
    .from("hv_enrollments")
    .select("*")
    .eq("id", body.enrollment_id)
    .eq("status", "active")
    .single();

  if (loadError || !enrollment) {
    return apiError("Active enrollment not found", 404);
  }

  const typedEnrollment = enrollment as HvEnrollment;

  try {
    const result = await executeStep(admin, typedEnrollment);
    return apiSuccess(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown execution error";
    console.error("[execute] Step execution failed:", message);
    return apiError(message, 500);
  }
}
