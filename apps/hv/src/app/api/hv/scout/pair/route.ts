import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { selectPair } from "@/lib/scout/pairing";
import { selectPairWithClaude } from "@/lib/scout/ai-pairing";
import type { ContactCandidate, PairingConfig } from "@/lib/scout/types";

/**
 * POST /api/hv/scout/pair
 *
 * Select the best primary + secondary contacts from a candidate list.
 * Uses AI pairing with deterministic fallback.
 *
 * Body: {
 *   candidates: ContactCandidate[],
 *   pairing_config: PairingConfig,
 *   sender: { name, title, company, product },
 *   icp?: { icp_industry, icp_company_size_min, icp_company_size_max, icp_geography },
 *   target_company: { name, website?, industry?, size?, location?, description? },
 *   use_ai?: boolean (default true),
 *   exclude_names?: string[]
 * }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: {
    candidates: ContactCandidate[];
    pairing_config: PairingConfig;
    sender: { name: string; title: string; company: string; product: string };
    icp?: { icp_industry?: string; icp_company_size_min?: number; icp_company_size_max?: number; icp_geography?: string };
    target_company: { name: string; website?: string; industry?: string; size?: number | null; location?: string; description?: string };
    use_ai?: boolean;
    exclude_names?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.candidates || !Array.isArray(body.candidates) || body.candidates.length === 0) {
    return apiError("Missing or empty candidates array", 400);
  }

  if (!body.pairing_config) {
    return apiError("Missing pairing_config", 400);
  }

  const useAi = body.use_ai !== false;

  // Try AI pairing first, fall back to deterministic
  if (useAi) {
    try {
      const result = await selectPairWithClaude({
        sender: body.sender,
        icp: body.icp || {},
        pairingConfig: body.pairing_config,
        targetCompany: body.target_company,
        candidates: body.candidates,
        excludeNames: body.exclude_names,
      });

      return apiSuccess({ ...result, method: "ai" });
    } catch (err) {
      console.error("AI pairing failed, falling back to deterministic:", err);
    }
  }

  // Deterministic fallback
  const result = selectPair(body.candidates, body.pairing_config);
  return apiSuccess({ ...result, method: "deterministic" });
}
