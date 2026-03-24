import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import type { ContextLayer } from "@kinetiks/types";

const LAYERS: ContextLayer[] = [
  "org", "products", "voice", "customers",
  "narrative", "competitive", "market", "brand",
];

/**
 * GET /api/context
 * Returns all 8 context layers plus confidence scores in one call.
 *
 * Uses the admin client (service role) because this endpoint supports both
 * session-cookie and API-key auth. The server client requires cookie access
 * which is unavailable for API-key callers. Account isolation is enforced
 * by scoping every query to auth.account_id.
 */
export async function GET(request: Request): Promise<Response> {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  // Fetch all layers + confidence in parallel, preserving errors
  const [layerResults, confidenceResult] = await Promise.all([
    Promise.all(
      LAYERS.map(async (layer) => {
        const { data, error: layerError } = await admin
          .from(`kinetiks_context_${layer}`)
          .select("data, source, source_detail, confidence_score, updated_at")
          .eq("account_id", auth.account_id)
          .maybeSingle();

        return { layer, data, error: layerError };
      })
    ),
    admin
      .from("kinetiks_confidence")
      .select("*")
      .eq("account_id", auth.account_id)
      .maybeSingle(),
  ]);

  // Check for any layer query errors
  const failedLayers = layerResults.filter((r) => r.error !== null);
  if (failedLayers.length > 0) {
    for (const failed of failedLayers) {
      console.error(
        `Failed to fetch context layer "${failed.layer}" for account ${auth.account_id}:`,
        failed.error?.message
      );
    }
    return apiError("Failed to fetch context layers", 500);
  }

  // Check confidence query error
  if (confidenceResult.error) {
    console.error(
      `Failed to fetch confidence for account ${auth.account_id}:`,
      confidenceResult.error.message
    );
    return apiError("Failed to fetch confidence scores", 500);
  }

  const layers: Record<string, unknown> = {};
  for (const { layer, data } of layerResults) {
    layers[layer] = data;
  }

  return apiSuccess({
    layers,
    confidence: confidenceResult.data ?? null,
  });
}
