import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import { executeRoutes } from "@/lib/cortex/route";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import type { ContextLayer } from "@kinetiks/types";

/**
 * POST /api/cortex/route
 *
 * Manually trigger routing for a specific layer change.
 * Normally routing happens automatically after proposal acceptance,
 * but this endpoint allows explicit re-routing (e.g., after user edits).
 *
 * Body: {
 *   account_id: string,
 *   source_app: string,
 *   target_layer: ContextLayer,
 *   proposal_id?: string,
 *   changes: Record<string, unknown>,
 *   confidence: string
 * }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const body = await request.json();
  const {
    account_id,
    source_app,
    target_layer,
    proposal_id,
    changes,
    confidence,
  } = body as {
    account_id: string;
    source_app: string;
    target_layer: ContextLayer;
    proposal_id?: string;
    changes: Record<string, unknown>;
    confidence: string;
  };

  if (!account_id || !source_app || !target_layer || !changes) {
    return apiError("Missing required fields: account_id, source_app, target_layer, changes", 400);
  }

  // Validate target_layer is a known ContextLayer
  const validLayers: ContextLayer[] = [
    "org", "products", "voice", "customers",
    "narrative", "competitive", "market", "brand",
  ];
  if (!validLayers.includes(target_layer)) {
    return apiError(`Invalid target_layer: '${target_layer}'. Must be one of: ${validLayers.join(", ")}`, 400);
  }

  // Validate changes is a plain non-null object
  if (typeof changes !== "object" || Array.isArray(changes)) {
    return apiError("changes must be a plain object", 400);
  }

  const admin = createAdminClient();

  // If not internal service call, verify the user owns the target account
  if (auth.auth_method !== "internal") {
    const { data: account } = await admin
      .from("kinetiks_accounts")
      .select("id")
      .eq("id", account_id)
      .eq("user_id", auth.user_id)
      .single();

    if (!account) {
      return apiError("Forbidden: account does not belong to you", 403);
    }
  }

  const routedCount = await executeRoutes(
    admin,
    account_id,
    source_app,
    target_layer,
    proposal_id ?? "manual",
    changes,
    confidence ?? "inferred"
  );

  return apiSuccess({
    routed: routedCount,
    target_layer,
    source_app,
  });
}
