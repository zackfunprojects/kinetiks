import type {
  ReviewRequest,
  ReviewResponse,
  SentinelVerdict,
  SentinelFlag,
  FatigueCheckResult,
  ComplianceCheckResult,
} from "@kinetiks/types";
import { SupabaseClient } from "@supabase/supabase-js";
import { evaluateEditorial } from "./editorial";
import { evaluateBrandSafety, brandSafetyVerdict } from "./brand-safety";
import { evaluateCompliance } from "./compliance";
import { evaluateFatigue } from "./fatigue";
import { routeEscalation } from "./escalation";
import { scoreToVerdict } from "./thresholds";
import { createHash } from "crypto";

/**
 * The core Sentinel review pipeline.
 *
 * Orchestrates all 5 functions:
 * 1. Editorial quality (AI - Sonnet)
 * 2. Brand safety (AI - Sonnet)
 * 3. Compliance verification (rule-based + AI)
 * 4. Contact fatigue (DB-powered)
 * 5. Verdict determination (composite)
 *
 * Writes the review record to kinetiks_sentinel_reviews.
 * Routes escalations for flagged/held verdicts.
 */
export async function reviewContent(
  admin: SupabaseClient,
  request: ReviewRequest
): Promise<ReviewResponse> {
  const contentHash = createHash("sha256")
    .update(request.content)
    .digest("hex")
    .slice(0, 16);

  // Load relevant context layers for AI evaluations
  const contextLayers = await loadContextLayers(admin, request.account_id);

  // Run all evaluations - editorial and brand safety in parallel,
  // compliance and fatigue can also run in parallel
  const [editorialResult, brandSafetyResult, complianceResult, fatigueResult] =
    await Promise.all([
      evaluateEditorial(request.content, request.content_type, {
        voice: contextLayers.voice,
        products: contextLayers.products,
        competitive: contextLayers.competitive,
      }),
      evaluateBrandSafety(request.content, request.content_type, {
        competitive: contextLayers.competitive,
        narrative: contextLayers.narrative,
        customers: contextLayers.customers,
      }),
      evaluateCompliance(
        request.content,
        request.content_type,
        contextLayers.products
      ),
      evaluateFatigue(admin, {
        accountId: request.account_id,
        contactEmail: request.contact_email,
        contactLinkedin: request.contact_linkedin,
        orgDomain: request.org_domain,
      }),
    ]);

  // Determine composite verdict
  const editorialVerdict = scoreToVerdict(
    editorialResult.composite_score,
    request.content_type
  );
  const safetyVerdict = brandSafetyVerdict(brandSafetyResult);
  const complianceVerdict: SentinelVerdict = complianceResult.passed
    ? "approved"
    : "held";
  const fatigueVerdict: SentinelVerdict =
    fatigueResult.decision === "blocked"
      ? "held"
      : fatigueResult.decision === "delayed"
        ? "flagged"
        : "approved";

  // Final verdict: most restrictive wins
  const verdict = resolveVerdict([
    editorialVerdict,
    safetyVerdict,
    complianceVerdict,
    fatigueVerdict,
  ]);

  // Merge all flags
  const allFlags: SentinelFlag[] = [
    ...editorialResult.flags,
    ...brandSafetyResult.flags,
    ...complianceResult.flags,
    ...fatigueResult.flags,
  ];

  // Write review record
  const { data: review, error: reviewError } = await admin
    .from("kinetiks_sentinel_reviews")
    .insert({
      account_id: request.account_id,
      source_app: request.source_app,
      source_operator: request.source_operator ?? null,
      content_type: request.content_type,
      content_hash: contentHash,
      content: request.content,
      quality_score: editorialResult.composite_score,
      verdict,
      flags: allFlags,
      fatigue_check_result: fatigueResult,
      compliance_check_result: complianceResult,
      contact_email: request.contact_email ?? null,
      contact_linkedin: request.contact_linkedin ?? null,
      org_domain: request.org_domain ?? null,
      metadata: request.metadata ?? {},
    })
    .select("id")
    .single();

  if (reviewError) {
    console.error("Failed to write sentinel review:", reviewError.message);
    throw new Error(`Failed to write sentinel review: ${reviewError.message}`);
  }

  const reviewId = review.id as string;

  // Route escalation for flagged/held verdicts
  if (verdict !== "approved") {
    try {
      await routeEscalation(admin, {
        accountId: request.account_id,
        sourceApp: request.source_app,
        sourceOperator: request.source_operator,
        reviewId,
        verdict,
        qualityScore: editorialResult.composite_score,
        flags: allFlags,
        fatigue: fatigueResult,
        compliance: complianceResult,
        contactEmail: request.contact_email,
        contactLinkedin: request.contact_linkedin,
        orgDomain: request.org_domain,
      });
    } catch (err) {
      // Escalation failure is non-fatal - the review was already recorded
      console.error("Failed to route escalation:", err);
    }
  }

  // Log to learning ledger
  await logToLedger(admin, request, reviewId, verdict, editorialResult.composite_score);

  return {
    review_id: reviewId,
    verdict,
    quality_score: editorialResult.composite_score,
    flags: allFlags,
    fatigue: fatigueResult,
    compliance: complianceResult,
  };
}

/**
 * Resolve the most restrictive verdict from multiple checks.
 * held > flagged > approved
 */
function resolveVerdict(verdicts: SentinelVerdict[]): SentinelVerdict {
  if (verdicts.includes("held")) return "held";
  if (verdicts.includes("flagged")) return "flagged";
  return "approved";
}

/**
 * Load Context Structure layers needed for Sentinel evaluations.
 */
async function loadContextLayers(
  admin: SupabaseClient,
  accountId: string
): Promise<{
  voice: Record<string, unknown>;
  products: Record<string, unknown>;
  competitive: Record<string, unknown>;
  narrative: Record<string, unknown>;
  customers: Record<string, unknown>;
}> {
  const layers = ["voice", "products", "competitive", "narrative", "customers"];
  const results: Record<string, Record<string, unknown>> = {};

  await Promise.all(
    layers.map(async (layer) => {
      const { data } = await admin
        .from(`kinetiks_context_${layer}`)
        .select("data")
        .eq("account_id", accountId)
        .maybeSingle();

      results[layer] = (data?.data as Record<string, unknown>) ?? {};
    })
  );

  return {
    voice: results.voice,
    products: results.products,
    competitive: results.competitive,
    narrative: results.narrative,
    customers: results.customers,
  };
}

/**
 * Log the review to the learning ledger.
 */
async function logToLedger(
  admin: SupabaseClient,
  request: ReviewRequest,
  reviewId: string,
  verdict: SentinelVerdict,
  qualityScore: number
): Promise<void> {
  const { error } = await admin.from("kinetiks_ledger").insert({
    account_id: request.account_id,
    event_type: "sentinel_review",
    source_app: request.source_app,
    source_operator: request.source_operator ?? null,
    detail: {
      review_id: reviewId,
      content_type: request.content_type,
      verdict,
      quality_score: qualityScore,
    },
  });

  if (error) {
    console.error("Failed to log sentinel review to ledger:", error.message);
  }
}
