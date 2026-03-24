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
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  // Fetch all layers + confidence in parallel
  const [layerResults, confidenceResult] = await Promise.all([
    Promise.all(
      LAYERS.map((layer) =>
        admin
          .from(`kinetiks_context_${layer}`)
          .select("data, source, source_detail, confidence_score, updated_at")
          .eq("account_id", auth.account_id)
          .maybeSingle()
          .then(({ data }) => [layer, data] as const)
      )
    ),
    admin
      .from("kinetiks_confidence")
      .select("*")
      .eq("account_id", auth.account_id)
      .maybeSingle(),
  ]);

  const layers: Record<string, unknown> = {};
  for (const [layer, data] of layerResults) {
    layers[layer] = data;
  }

  return apiSuccess({
    layers,
    confidence: confidenceResult.data ?? null,
  });
}
