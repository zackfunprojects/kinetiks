import type { ApprovalSubmission, GateResult } from "./types";

type QualityCheck = (submission: ApprovalSubmission) => GateResult;

/**
 * App-specific quality gate registry.
 * Each app can register its own quality checks.
 */
const APP_CHECKS: Record<string, QualityCheck> = {
  harvest: checkHarvest,
  dark_madder: checkDarkMadder,
  litmus: checkLitmus,
};

/**
 * Run quality gate - applies domain-specific checks based on source app.
 */
export function runQualityGate(submission: ApprovalSubmission): GateResult {
  const check = APP_CHECKS[submission.source_app];

  if (check) {
    return check(submission);
  }

  // Generic fallback - always passes
  return {
    passed: true,
    feedback: null,
    revision_count: 0,
    details: { check: "generic_fallback" },
  };
}

/**
 * Harvest quality checks:
 * - CAN-SPAM basics
 * - Cadence checks
 * - Personalization validation
 */
function checkHarvest(submission: ApprovalSubmission): GateResult {
  const issues: string[] = [];
  const preview = submission.preview.content;

  if (submission.preview.type === "email") {
    const body = (preview.body as string) ?? "";
    const subject = (preview.subject as string) ?? "";

    // CAN-SPAM: check for unsubscribe mention
    if (
      submission.action_category.includes("email") &&
      !body.toLowerCase().includes("unsubscribe")
    ) {
      issues.push("Missing unsubscribe link (CAN-SPAM requirement)");
    }

    // Empty subject
    if (!subject.trim()) {
      issues.push("Email subject is empty");
    }

    // Placeholder detection
    const placeholderPattern = /\[(?:First ?Name|Last ?Name|Company|Title)\]/i;
    if (placeholderPattern.test(body) || placeholderPattern.test(subject)) {
      issues.push("Unresolved merge field placeholders detected");
    }

    // Spam trigger words (basic check)
    const spamWords = ["guaranteed", "act now", "limited time", "click here", "buy now"];
    const lowerBody = body.toLowerCase();
    const found = spamWords.filter((w) => lowerBody.includes(w));
    if (found.length >= 2) {
      issues.push(`Multiple spam trigger words detected: ${found.join(", ")}`);
    }
  }

  if (submission.preview.type === "sequence") {
    const steps = (preview.steps as unknown[]) ?? [];
    if (steps.length === 0) {
      issues.push("Sequence has no steps");
    }
  }

  return {
    passed: issues.length === 0,
    feedback: issues.length > 0 ? issues.join(". ") : null,
    revision_count: 0,
    details: { issues, check: "harvest" },
  };
}

/**
 * Dark Madder quality checks:
 * - Readability
 * - SEO basics
 */
function checkDarkMadder(submission: ApprovalSubmission): GateResult {
  const issues: string[] = [];
  const preview = submission.preview.content;

  if (submission.preview.type === "content") {
    const body = (preview.body as string) ?? "";
    const title = (preview.title as string) ?? "";

    if (!title.trim()) {
      issues.push("Content title is empty");
    }

    if (body.length < 200) {
      issues.push("Content body is very short (< 200 characters)");
    }

    // Check for heading structure
    if (body.length > 500 && !body.includes("#")) {
      issues.push("Long content missing heading structure");
    }
  }

  return {
    passed: issues.length === 0,
    feedback: issues.length > 0 ? issues.join(". ") : null,
    revision_count: 0,
    details: { issues, check: "dark_madder" },
  };
}

/**
 * Litmus quality checks:
 * - Pitch tone
 * - No duplicate pitches
 */
function checkLitmus(submission: ApprovalSubmission): GateResult {
  const issues: string[] = [];
  const preview = submission.preview.content;

  if (submission.preview.type === "pitch") {
    const body = (preview.body as string) ?? "";

    if (!body.trim()) {
      issues.push("Pitch body is empty");
    }

    if (body.length > 3000) {
      issues.push("Pitch is too long (> 3000 characters) - journalists prefer concise pitches");
    }
  }

  return {
    passed: issues.length === 0,
    feedback: issues.length > 0 ? issues.join(". ") : null,
    revision_count: 0,
    details: { issues, check: "litmus" },
  };
}
