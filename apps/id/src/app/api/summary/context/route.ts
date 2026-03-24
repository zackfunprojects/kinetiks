import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import type { ContextLayer } from "@kinetiks/types";

const LAYERS: ContextLayer[] = [
  "org", "products", "voice", "customers",
  "narrative", "competitive", "market", "brand",
];

/**
 * GET /api/summary/context
 * Returns a compact, agent-friendly summary of the Context Structure.
 * Includes: org name, product count, confidence, last-updated per layer, top gaps.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const [layerResults, confidenceResult] = await Promise.all([
    Promise.all(
      LAYERS.map((layer) =>
        admin
          .from(`kinetiks_context_${layer}`)
          .select("data, confidence_score, updated_at")
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

  if (confidenceResult.error) {
    return apiError("Failed to fetch context summary", 500);
  }

  // Extract key info from layers
  const orgData = layerResults.find(([l]) => l === "org")?.[1];
  const productsData = layerResults.find(([l]) => l === "products")?.[1];

  const orgInfo = orgData?.data as Record<string, unknown> | undefined;
  const productsInfo = productsData?.data as Record<string, unknown> | undefined;
  const productsList = (productsInfo?.products as unknown[]) ?? [];

  // Build per-layer summary
  const layerSummary: Record<string, { confidence: number; updated_at: string | null; has_data: boolean }> = {};
  const gaps: string[] = [];

  for (const [layer, data] of layerResults) {
    const score = (data?.confidence_score as number) ?? 0;
    layerSummary[layer] = {
      confidence: score,
      updated_at: (data?.updated_at as string) ?? null,
      has_data: !!data?.data && Object.keys(data.data as Record<string, unknown>).length > 0,
    };

    if (score < 30) {
      gaps.push(layer);
    }
  }

  const confidence = confidenceResult.data;

  return apiSuccess({
    company_name: (orgInfo?.company_name as string) ?? null,
    industry: (orgInfo?.industry as string) ?? null,
    product_count: productsList.length,
    aggregate_confidence: (confidence?.aggregate as number) ?? 0,
    layers: layerSummary,
    gaps,
  });
}
