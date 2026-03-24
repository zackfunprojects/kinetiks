import type {
  OverrideUserAction,
  SentinelReview,
} from "@kinetiks/types";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Process a user override and extract learnings.
 *
 * Learning signals:
 * - sent_unchanged on a held review -> threshold was too conservative
 * - edited on a held review -> hold was justified but may need precision tuning
 * - rejected on an approved review -> Sentinel missed something, increase sensitivity
 * - Consistent pattern of sent_unchanged -> reduce flag frequency for this pattern
 *
 * Promoted learnings are submitted as Proposals to the Cortex:
 * - Fatigue patterns -> Customers layer
 * - Quality patterns -> Voice layer
 * - Brand safety patterns -> Competitive layer (via Marcus)
 */
export async function processOverride(
  admin: SupabaseClient,
  accountId: string,
  reviewId: string,
  userAction: OverrideUserAction,
  editDiff?: string
): Promise<void> {
  // Fetch the review
  const { data: review, error: reviewError } = await admin
    .from("kinetiks_sentinel_reviews")
    .select("*")
    .eq("id", reviewId)
    .eq("account_id", accountId)
    .single();

  if (reviewError || !review) {
    console.error(
      `Failed to fetch review ${reviewId} for learning:`,
      reviewError?.message
    );
    return;
  }

  const typedReview = review as unknown as SentinelReview;

  // Record the override
  const overrideType =
    userAction === "rejected" ? "tightened" : "released";

  const { error: overrideError } = await admin
    .from("kinetiks_sentinel_overrides")
    .insert({
      account_id: accountId,
      review_id: reviewId,
      override_type: overrideType,
      user_action: userAction,
      edit_diff: editDiff ?? null,
    });

  if (overrideError) {
    console.error("Failed to record override:", overrideError.message);
  }

  // Update the review resolution
  const resolution =
    userAction === "sent_unchanged"
      ? "overridden"
      : userAction === "edited"
        ? "revised"
        : "rejected";

  const { error: updateError } = await admin
    .from("kinetiks_sentinel_reviews")
    .update({
      resolution,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", reviewId);

  if (updateError) {
    console.error("Failed to update review resolution:", updateError.message);
  }

  // Analyze patterns for learning (async, non-blocking)
  analyzePatterns(admin, accountId, typedReview, userAction).catch((err) => {
    console.error("Pattern analysis failed:", err);
  });

  // Log to ledger
  await admin.from("kinetiks_ledger").insert({
    account_id: accountId,
    event_type: "sentinel_override",
    source_app: typedReview.source_app,
    detail: {
      review_id: reviewId,
      original_verdict: typedReview.verdict,
      user_action: userAction,
      override_type: overrideType,
      content_type: typedReview.content_type,
      quality_score: typedReview.quality_score,
    },
  });
}

/**
 * Analyze override patterns for threshold calibration.
 *
 * Checks recent overrides to detect if Sentinel is consistently
 * too conservative or too permissive for this account.
 */
async function analyzePatterns(
  admin: SupabaseClient,
  accountId: string,
  review: SentinelReview,
  userAction: OverrideUserAction
): Promise<void> {
  // Look at recent overrides for the same content type
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: recentOverrides } = await admin
    .from("kinetiks_sentinel_overrides")
    .select(
      `
      user_action,
      review_id,
      kinetiks_sentinel_reviews!inner(content_type, verdict, quality_score)
    `
    )
    .eq("account_id", accountId)
    .gte("created_at", thirtyDaysAgo);

  if (!recentOverrides || recentOverrides.length < 5) {
    // Not enough data for pattern detection
    return;
  }

  // Count override types for this content type
  const sameTypeOverrides = recentOverrides.filter((o) => {
    const reviewData = o.kinetiks_sentinel_reviews as unknown as {
      content_type: string;
    };
    return reviewData.content_type === review.content_type;
  });

  if (sameTypeOverrides.length < 3) return;

  const sentUnchangedCount = sameTypeOverrides.filter(
    (o) => o.user_action === "sent_unchanged"
  ).length;

  const rejectedCount = sameTypeOverrides.filter(
    (o) => o.user_action === "rejected"
  ).length;

  const sentUnchangedRatio = sentUnchangedCount / sameTypeOverrides.length;
  const rejectedRatio = rejectedCount / sameTypeOverrides.length;

  // If >70% of overrides are "sent_unchanged", Sentinel is too conservative
  if (sentUnchangedRatio > 0.7) {
    await submitThresholdProposal(
      admin,
      accountId,
      review.content_type,
      "lower",
      `${Math.round(sentUnchangedRatio * 100)}% of held ${review.content_type} reviews were sent unchanged - consider lowering quality threshold`
    );
  }

  // If >50% of overrides are "rejected", Sentinel is too permissive
  if (rejectedRatio > 0.5) {
    await submitThresholdProposal(
      admin,
      accountId,
      review.content_type,
      "raise",
      `${Math.round(rejectedRatio * 100)}% of approved ${review.content_type} reviews were rejected by user - consider raising quality threshold`
    );
  }
}

/**
 * Submit a threshold adjustment as a Proposal to the Cortex.
 * These go to the Voice layer since they affect content quality standards.
 */
async function submitThresholdProposal(
  admin: SupabaseClient,
  accountId: string,
  contentType: string,
  direction: "lower" | "raise",
  reason: string
): Promise<void> {
  const { error } = await admin.from("kinetiks_proposals").insert({
    account_id: accountId,
    source_app: "sentinel",
    source_operator: "learning_loop",
    target_layer: "voice",
    action: "escalate",
    confidence: "inferred",
    payload: {
      sentinel_threshold_suggestion: {
        content_type: contentType,
        direction,
        reason,
      },
    },
    evidence: [
      {
        type: "analytics",
        value: reason,
        context: `Sentinel learning loop detected pattern in ${contentType} overrides`,
        date: new Date().toISOString(),
      },
    ],
    status: "submitted",
  });

  if (error) {
    console.error("Failed to submit threshold proposal:", error.message);
  }
}
