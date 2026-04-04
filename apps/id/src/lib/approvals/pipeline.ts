import { createAdminClient } from "@/lib/supabase/admin";
import type { ApprovalSubmission, PipelineResult } from "./types";
import { runBrandGate } from "./brand-gate";
import { runQualityGate } from "./quality-gate";
import { classifyApproval } from "./classify";
import { calculateConfidence } from "./confidence";
import { getThreshold, shouldAutoApprove } from "./threshold";
import { emitApprovalEvent } from "./events";
import { getConfidence } from "@/lib/cortex/confidence";

/**
 * Process an approval submission through the full pipeline:
 * 1. Brand gate
 * 2. Quality gate
 * 3. Classify (quick/review/strategic)
 * 4. Calculate confidence
 * 5. Check against threshold
 * 6. Auto-approve or create pending record
 * 7. Emit event + log to Ledger
 */
export async function processApproval(
  submission: ApprovalSubmission,
  accountId: string
): Promise<PipelineResult> {
  const admin = createAdminClient();

  // Step 1: Brand gate
  const brandResult = await runBrandGate(submission, accountId);

  // Step 2: Quality gate
  const qualityResult = runQualityGate(submission);

  // Step 3: Get confidence inputs
  const cortexConfidence = await getCortexConfidence(admin, accountId);
  const threshold = await getThreshold(accountId, submission.action_category);

  const categoryHistory = {
    approval_count: threshold.total_approvals + threshold.total_rejections,
    approval_rate: threshold.approval_rate,
    edit_rate: threshold.edit_rate,
    consecutive_clean: threshold.consecutive_approvals,
    last_rejection_at: threshold.last_rejection_at,
  };

  // Step 4: Classify
  const approvalType = classifyApproval(submission, categoryHistory, cortexConfidence);

  // Step 5: Calculate confidence
  const confidenceResult = calculateConfidence({
    cortex_confidence: cortexConfidence,
    category_history: categoryHistory,
    action_specificity: submission.agent_confidence, // Use agent confidence as specificity proxy
    agent_confidence: submission.agent_confidence,
  });

  // Step 6: Check auto-approve
  const autoApprove =
    brandResult.passed &&
    qualityResult.passed &&
    shouldAutoApprove(threshold, confidenceResult.score, approvalType);

  // Step 7: Create approval record
  const status = autoApprove ? "auto_approved" : "pending";
  const expiresAt = submission.expires_in_hours
    ? new Date(Date.now() + submission.expires_in_hours * 60 * 60 * 1000).toISOString()
    : null;

  const { data: approval, error: insertError } = await admin
    .from("kinetiks_approvals")
    .insert({
      account_id: accountId,
      source_app: submission.source_app,
      source_operator: submission.source_operator,
      action_category: submission.action_category,
      approval_type: approvalType,
      title: submission.title,
      description: submission.description,
      preview: submission.preview,
      deep_link: submission.deep_link,
      status,
      confidence_score: confidenceResult.score,
      confidence_breakdown: confidenceResult.breakdown,
      auto_approved: autoApprove,
      brand_gate_result: brandResult,
      quality_gate_result: qualityResult,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (insertError || !approval) {
    throw new Error(`Failed to create approval: ${insertError?.message}`);
  }

  // Step 8: Log to Ledger
  await admin.from("kinetiks_ledger").insert({
    account_id: accountId,
    event_type: autoApprove ? "approval_auto_approved" : "approval_created",
    source_app: submission.source_app,
    target_layer: null,
    data: {
      approval_id: approval.id,
      approval_type: approvalType,
      confidence_score: confidenceResult.score,
      auto_approved: autoApprove,
      brand_gate_passed: brandResult.passed,
      quality_gate_passed: qualityResult.passed,
    },
    attribution: `${submission.source_app}/${submission.source_operator}`,
  });

  // Step 9: Emit event
  await emitApprovalEvent(
    autoApprove ? "approval_auto_approved" : "approval_created",
    approval.id,
    accountId,
    submission.action_category,
    {
      approval_type: approvalType,
      confidence_score: confidenceResult.score,
    }
  );

  return {
    approval_id: approval.id,
    auto_approved: autoApprove,
    approval_type: approvalType,
    confidence_score: confidenceResult.score,
    brand_gate: brandResult,
    quality_gate: qualityResult,
  };
}

async function getCortexConfidence(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string
): Promise<number> {
  try {
    const confidence = await getConfidence(admin, accountId);
    // Average all layer confidences
    const values = Object.values(confidence).filter(
      (v): v is number => typeof v === "number"
    );
    if (values.length === 0) return 30; // Default low confidence
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  } catch {
    return 30;
  }
}
