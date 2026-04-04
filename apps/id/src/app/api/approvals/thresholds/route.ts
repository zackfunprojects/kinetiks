import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { setOverride } from "@/lib/approvals/threshold";
import type { OverrideRule } from "@/lib/approvals/types";
import { NextRequest } from "next/server";

/**
 * GET /api/approvals/thresholds
 * List all thresholds for the account.
 */
export async function GET(request: NextRequest) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const { data: thresholds, error: queryError } = await admin
    .from("kinetiks_approval_thresholds")
    .select("*")
    .eq("account_id", auth.account_id)
    .order("action_category", { ascending: true });

  if (queryError) {
    return apiError("Failed to fetch thresholds", 500);
  }

  return apiSuccess({ thresholds: thresholds ?? [] });
}

/**
 * POST /api/approvals/thresholds
 * Update a threshold override for a category.
 * Body: { action_category: string, override_rule: 'always_approve' | 'always_ask' | 'confidence_based' }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: { action_category: string; override_rule: OverrideRule };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.action_category || !body.override_rule) {
    return apiError("Missing required fields: action_category, override_rule", 400);
  }

  const validRules: OverrideRule[] = ["always_approve", "always_ask", "confidence_based"];
  if (!validRules.includes(body.override_rule)) {
    return apiError("Invalid override_rule", 400);
  }

  try {
    await setOverride(auth.account_id, body.action_category, body.override_rule);
    return apiSuccess({ updated: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return apiError(message, 500);
  }
}
