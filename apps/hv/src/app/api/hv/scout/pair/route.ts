import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { selectPair } from "@/lib/scout/pairing";
import { selectPairWithClaude } from "@/lib/scout/ai-pairing";
import { pullHarvestContext } from "@/lib/synapse/client";
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
    const parsed = await request.json();
    if (parsed === null || typeof parsed !== "object") {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed;
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

  if (useAi) {
    if (!body.sender || !body.target_company) {
      return apiError("sender and target_company are required when use_ai is true", 400);
    }
  }

  // Filter out excluded names once, used by both AI and deterministic paths
  const excludeSet = new Set((body.exclude_names || []).map((n: string) => n.toLowerCase()));
  const filteredCandidates = excludeSet.size > 0
    ? body.candidates.filter((c) => !excludeSet.has((c.name || "").toLowerCase()))
    : body.candidates;

  if (filteredCandidates.length === 0) {
    return apiError("No candidates remain after applying exclude_names", 400);
  }

  // Pull personas from Kinetiks ID customers layer to enrich pairing
  let personas: Array<Record<string, unknown>> = [];
  try {
    const ctx = await pullHarvestContext(auth.account_id, ["customers"]);
    const customersData = ctx?.layers.customers?.data as Record<string, unknown> | undefined;
    if (customersData && Array.isArray(customersData.personas)) {
      personas = customersData.personas as Array<Record<string, unknown>>;
    }
  } catch {
    // Non-fatal - pairing works without personas
  }

  // Try AI pairing first, fall back to deterministic
  if (useAi) {
    try {
      const result = await selectPairWithClaude({
        sender: body.sender,
        icp: body.icp || {},
        pairingConfig: body.pairing_config,
        targetCompany: body.target_company,
        candidates: filteredCandidates,
        excludeNames: body.exclude_names,
        personas,
      });

      return apiSuccess({ ...result, method: "ai" });
    } catch (err) {
      console.error("AI pairing failed, falling back to deterministic:", err);
    }
  }

  // Deterministic fallback
  const result = selectPair(filteredCandidates, body.pairing_config);
  return apiSuccess({ ...result, method: "deterministic" });
}
