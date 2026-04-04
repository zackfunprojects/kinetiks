import type { ApprovalSubmission, ApprovalType, CategoryHistory } from "./types";

/**
 * Classify an approval as quick, review, or strategic.
 *
 * Strategic conditions checked first (highest priority):
 * - Changes strategy or affects multiple outputs
 * - Involves budget (action_category contains "budget" or "targeting")
 * - Confidence < 40
 *
 * Quick conditions (lowest friction):
 * - Content < 500 chars
 * - Category has >5 prior approvals
 * - No strategic implications
 *
 * Default: review
 */
export function classifyApproval(
  submission: ApprovalSubmission,
  history: CategoryHistory,
  cortexConfidence: number
): ApprovalType {
  // Strategic checks first
  if (isStrategic(submission, cortexConfidence)) {
    return "strategic";
  }

  // Quick checks
  if (isQuick(submission, history)) {
    return "quick";
  }

  return "review";
}

function isStrategic(submission: ApprovalSubmission, cortexConfidence: number): boolean {
  // Changes targeting, messaging, or campaign parameters
  if (submission.changes_strategy) return true;

  // Affects multiple future outputs
  if (submission.affects_multiple_outputs) return true;

  // Budget or targeting categories are always strategic
  const strategicCategories = ["targeting_change", "context_update_major"];
  if (strategicCategories.includes(submission.action_category)) return true;

  // Very low confidence - needs human judgment
  if (cortexConfidence < 40) return true;

  return false;
}

function isQuick(submission: ApprovalSubmission, history: CategoryHistory): boolean {
  // Must be short content
  if (submission.content_length >= 500) return false;

  // Must have sufficient history (>5 prior approvals)
  if (history.approval_count <= 5) return false;

  // Recent rejection disqualifies from quick
  if (history.last_rejection_at) {
    const daysSinceRejection = (Date.now() - new Date(history.last_rejection_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceRejection <= 7) return false;
  }

  // High edit rate disqualifies from quick
  if (history.edit_rate > 50) return false;

  // No strategic implications (already checked above, but guard)
  if (submission.changes_strategy || submission.affects_multiple_outputs) return false;

  return true;
}
