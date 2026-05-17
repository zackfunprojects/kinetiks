import type { ApprovalSubmission, GateResult } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { routeAskClaude } from "@kinetiks/ai";
import { reviewContent } from "@kinetiks/sentinel";
import type { SentinelContentType, SentinelVerdict } from "@kinetiks/types";

/**
 * Brand consistency gate.
 *
 * Two parallel signals:
 *  1. Voice-layer brand match (Haiku, via the router → ai_calls observable)
 *  2. Sentinel reviewContent (editorial + brand_safety + compliance + fatigue)
 *     when the preview maps to a SentinelContentType.
 *
 * The gate `passed` flag is the conjunction of both signals. A Sentinel
 * `held` verdict trumps everything and blocks the approval; `flagged`
 * still passes but surfaces in the gate feedback. Sentinel failures
 * degrade permissively (Haiku-only) so an outage in one path doesn't
 * stall the entire approval queue.
 */
export async function runBrandGate(
  submission: ApprovalSubmission,
  accountId: string
): Promise<GateResult> {
  const admin = createAdminClient();

  // ── Signal 1: Voice-layer Haiku check ──────────────────────
  const haiku = await runHaikuBrandCheck(submission, accountId);

  // ── Signal 2: Sentinel review (when content type maps) ─────
  const sentinelContentType = sentinelContentTypeForPreview(submission.preview.type);
  if (!sentinelContentType) {
    return haiku;
  }

  const contentToReview = extractContent(submission);
  if (!contentToReview) {
    return haiku;
  }

  let sentinelVerdict: SentinelVerdict = "approved";
  let sentinelReviewId: string | null = null;
  let sentinelFeedback: string | null = null;
  try {
    const review = await reviewContent(admin, {
      account_id: accountId,
      source_app: submission.source_app,
      source_operator: submission.source_operator,
      content_type: sentinelContentType,
      content: contentToReview,
      metadata: {
        origin: "approval_brand_gate",
        action_category: submission.action_category,
      },
    });
    sentinelVerdict = review.verdict;
    sentinelReviewId = review.review_id;
    if (review.flags && review.flags.length > 0) {
      sentinelFeedback = review.flags
        .map((f) => `${f.category}:${f.severity} ${f.detail ?? ""}`.trim())
        .slice(0, 3)
        .join("; ");
    }
  } catch (e) {
    // Sentinel outage must not block the approval — fall back to Haiku alone
    return {
      passed: haiku.passed,
      feedback: haiku.feedback ?? "Sentinel unavailable; brand-gate degraded to Voice-layer Haiku only.",
      revision_count: haiku.revision_count,
      details: {
        haiku: haiku.details,
        sentinel_error: e instanceof Error ? e.message : String(e),
      },
    };
  }

  if (sentinelVerdict === "held") {
    return {
      passed: false,
      feedback: `Sentinel held this content${sentinelFeedback ? `: ${sentinelFeedback}` : ""}.`,
      revision_count: 0,
      details: {
        haiku: haiku.details,
        sentinel: {
          verdict: "held",
          review_id: sentinelReviewId,
          feedback: sentinelFeedback,
        },
      },
    };
  }

  // Sentinel "flagged" still passes but is surfaced; "approved" is clean.
  const sentinelOk = sentinelVerdict === "approved";
  return {
    passed: haiku.passed && sentinelOk,
    feedback: !sentinelOk
      ? `Sentinel flagged this content${sentinelFeedback ? `: ${sentinelFeedback}` : ""}.`
      : haiku.feedback,
    revision_count: haiku.revision_count,
    details: {
      haiku: haiku.details,
      sentinel: {
        verdict: sentinelVerdict,
        review_id: sentinelReviewId,
        feedback: sentinelFeedback,
      },
    },
  };
}

async function runHaikuBrandCheck(
  submission: ApprovalSubmission,
  accountId: string,
): Promise<GateResult> {
  const admin = createAdminClient();
  const { data: voiceRow } = await admin
    .from("kinetiks_context_voice")
    .select("data")
    .eq("account_id", accountId)
    .single();

  const voiceData = (voiceRow?.data as Record<string, unknown>) ?? null;

  if (!voiceData) {
    return {
      passed: true,
      feedback: null,
      revision_count: 0,
      details: { reason: "No voice layer configured yet" },
    };
  }

  const contentToCheck = extractContent(submission);

  if (!contentToCheck) {
    return {
      passed: true,
      feedback: null,
      revision_count: 0,
      details: { reason: "No evaluable content in preview" },
    };
  }

  try {
    const result = await routeAskClaude(
      "approval.brand_gate",
      `Brand Voice Guidelines:\n${JSON.stringify(voiceData, null, 2)}\n\nContent to evaluate:\n${contentToCheck}`,
      `You are a brand consistency checker. Evaluate whether the following content matches the brand voice guidelines. Respond with JSON only: { "passed": boolean, "feedback": string | null, "scores": { "tone": number, "vocabulary": number, "messaging": number } }. Scores are 0-100.`,
      {
        maxTokens: 1024,
        context: { accountId },
      },
    );

    const parsed = JSON.parse(result);

    return {
      passed: parsed.passed ?? true,
      feedback: parsed.feedback ?? null,
      revision_count: 0,
      details: { scores: parsed.scores ?? {} },
    };
  } catch {
    return {
      passed: true,
      feedback: "Brand check unavailable - passed by default",
      revision_count: 0,
      details: { error: "AI evaluation failed" },
    };
  }
}

function extractContent(submission: ApprovalSubmission): string | null {
  const preview = submission.preview.content;

  if (typeof preview.body === "string") return preview.body;
  if (typeof preview.content === "string") return preview.content;
  if (typeof preview.text === "string") return preview.text;
  if (typeof preview.subject === "string" && typeof preview.body === "string") {
    return `Subject: ${preview.subject}\n\n${preview.body}`;
  }

  const str = JSON.stringify(preview);
  return str.length > 10 ? str : null;
}

/**
 * Map an approval preview type to the closest matching Sentinel content
 * type. Returns null for previews that don't have a meaningful
 * Sentinel-content equivalent (config_change, budget, context_edit).
 */
function sentinelContentTypeForPreview(
  type: ApprovalSubmission["preview"]["type"],
): SentinelContentType | null {
  switch (type) {
    case "email":
      return "cold_email";
    case "content":
      return "blog_post";
    case "social_post":
      return "social_post";
    case "pitch":
      return "journalist_pitch";
    case "sequence":
      // Sequences are bundles of emails; use cold_email as the representative type.
      return "cold_email";
    case "prospect_list":
    case "config_change":
    case "budget":
    case "context_edit":
    default:
      return null;
  }
}
