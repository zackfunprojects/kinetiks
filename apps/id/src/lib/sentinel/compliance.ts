import type {
  ComplianceCheckResult,
  ComplianceRule,
  SentinelContentType,
  SentinelFlag,
} from "@kinetiks/types";
import { askClaude } from "@kinetiks/ai";
import { SENTINEL_COMPLIANCE_SYSTEM } from "@/lib/ai/prompts/sentinel";

/**
 * Which compliance domains apply to which apps/content types.
 */
const COMPLIANCE_MATRIX: Record<string, string[]> = {
  // Harvest
  cold_email: ["can_spam", "gdpr", "ccpa"],
  follow_up_email: ["can_spam", "gdpr", "ccpa"],
  linkedin_connect: [],
  linkedin_dm: [],
  voice_call_script: ["tcpa"],
  voicemail_script: ["tcpa"],
  auto_reply: ["can_spam"],
  meeting_message: [],

  // Dark Madder
  blog_post: ["copyright", "advertising"],
  social_post: ["advertising"],
  newsletter: ["can_spam", "copyright"],
  seo_content: ["copyright"],

  // Hypothesis
  landing_page: ["advertising", "privacy"],
  personalized_page: ["advertising", "privacy"],
  ab_variant: ["advertising"],

  // Litmus
  press_release: ["press_accuracy"],
  journalist_pitch: ["press_accuracy"],
  media_response: ["press_accuracy"],
};

/**
 * Check for standalone advertising disclosure tokens using word boundaries.
 * Avoids false positives from substrings like "made", "address", "advantage".
 */
const DISCLOSURE_PATTERN =
  /\b(ad|ads|advertisement|sponsored|paid|partner|partnership|promotion|promoted|disclosure|affiliate)\b/i;

function hasDisclosureToken(lowerContent: string): boolean {
  return DISCLOSURE_PATTERN.test(lowerContent);
}

/**
 * Rule-based compliance checks that don't require AI.
 * These are structural/format checks on the content itself.
 */
function runRuleBasedChecks(
  content: string,
  contentType: SentinelContentType,
  domains: string[]
): ComplianceRule[] {
  const rules: ComplianceRule[] = [];
  const lowerContent = content.toLowerCase();

  if (domains.includes("can_spam")) {
    rules.push({
      rule_id: "can_spam_unsubscribe",
      name: "CAN-SPAM: Unsubscribe mechanism",
      applies_to: ["cold_email", "follow_up_email", "auto_reply", "newsletter"],
      passed: lowerContent.includes("unsubscribe") || lowerContent.includes("opt out") || lowerContent.includes("opt-out"),
      detail: rules.length === 0 ? "No unsubscribe/opt-out mechanism detected" : null,
    });

    // Physical address check (emails should include one)
    const hasAddress =
      /\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|suite|ste)/i.test(content) ||
      lowerContent.includes("p.o. box") ||
      /\d{5}(-\d{4})?/.test(content); // ZIP code pattern
    rules.push({
      rule_id: "can_spam_address",
      name: "CAN-SPAM: Physical address",
      applies_to: ["cold_email", "follow_up_email", "newsletter"],
      passed: hasAddress,
      detail: hasAddress ? null : "No physical address detected in content",
    });
  }

  if (domains.includes("gdpr")) {
    rules.push({
      rule_id: "gdpr_right_to_object",
      name: "GDPR: Right to object mechanism",
      applies_to: ["cold_email", "follow_up_email"],
      passed:
        lowerContent.includes("right to object") ||
        lowerContent.includes("unsubscribe") ||
        lowerContent.includes("opt out") ||
        lowerContent.includes("opt-out") ||
        lowerContent.includes("stop receiving"),
      detail: null,
    });
  }

  if (domains.includes("ccpa")) {
    rules.push({
      rule_id: "ccpa_privacy_link",
      name: "CCPA: Privacy policy reference",
      applies_to: ["cold_email", "follow_up_email"],
      passed:
        lowerContent.includes("privacy policy") ||
        lowerContent.includes("privacy"),
      detail: null,
    });
  }

  if (domains.includes("tcpa")) {
    rules.push({
      rule_id: "tcpa_ai_disclosure",
      name: "TCPA: AI disclosure",
      applies_to: ["voice_call_script", "voicemail_script"],
      passed:
        (contentType !== "voice_call_script" && contentType !== "voicemail_script") ||
        lowerContent.includes("ai") ||
        lowerContent.includes("automated") ||
        lowerContent.includes("artificial intelligence"),
      detail: null,
    });
  }

  if (domains.includes("privacy")) {
    rules.push({
      rule_id: "privacy_policy_link",
      name: "Privacy: Privacy policy link",
      applies_to: ["landing_page", "personalized_page"],
      passed:
        lowerContent.includes("privacy policy") ||
        lowerContent.includes("privacy"),
      detail: null,
    });
  }

  if (domains.includes("advertising")) {
    rules.push({
      rule_id: "advertising_disclosure",
      name: "Advertising: Sponsored content disclosure",
      applies_to: [
        "blog_post",
        "social_post",
        "landing_page",
        "personalized_page",
        "ab_variant",
      ],
      // Only flag if content appears sponsored but lacks disclosure
      passed: !lowerContent.includes("sponsored") || hasDisclosureToken(lowerContent),
      detail: null,
    });
  }

  // Filter rules to only those that apply to this content type
  return rules.filter(
    (rule) =>
      rule.applies_to.length === 0 ||
      rule.applies_to.includes(contentType)
  );
}

/**
 * AI-assisted compliance checks for nuanced domains.
 * Used for copyright, press accuracy, and factual accuracy checks
 * that require understanding content semantics.
 */
async function runAiComplianceChecks(
  content: string,
  contentType: SentinelContentType,
  domains: string[],
  productsData: Record<string, unknown>
): Promise<ComplianceRule[]> {
  const aiDomains = domains.filter((d) =>
    ["copyright", "press_accuracy"].includes(d)
  );

  if (aiDomains.length === 0) return [];

  const prompt = `Content type: ${contentType}
Compliance domains to check: ${aiDomains.join(", ")}

--- CONTENT TO REVIEW ---
${content}

--- PRODUCTS DATA (for factual accuracy) ---
${JSON.stringify(productsData, null, 2)}`;

  try {
    const response = await askClaude(prompt, {
      system: SENTINEL_COMPLIANCE_SYSTEM,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 1024,
    });

    const parsed = JSON.parse(response) as {
      rules: Array<{
        rule_id: string;
        name: string;
        passed: boolean;
        detail: string | null;
      }>;
    };

    return (parsed.rules ?? []).map((rule) => ({
      ...rule,
      applies_to: [contentType],
    }));
  } catch {
    // On AI failure, return a cautionary flag
    return [
      {
        rule_id: "ai_compliance_error",
        name: "AI compliance check failed",
        applies_to: [contentType],
        passed: false,
        detail: "AI-assisted compliance check could not be completed - manual review recommended",
      },
    ];
  }
}

/**
 * Run the full compliance verification pipeline.
 *
 * Combines rule-based structural checks with AI-assisted semantic checks.
 */
export async function evaluateCompliance(
  content: string,
  contentType: SentinelContentType,
  productsData: Record<string, unknown>
): Promise<ComplianceCheckResult> {
  const domains = COMPLIANCE_MATRIX[contentType] ?? [];

  if (domains.length === 0) {
    return { rules_checked: [], passed: true, flags: [] };
  }

  const ruleBasedResults = runRuleBasedChecks(content, contentType, domains);
  const aiResults = await runAiComplianceChecks(
    content,
    contentType,
    domains,
    productsData
  );

  const allRules = [...ruleBasedResults, ...aiResults];
  const failedRules = allRules.filter((r) => !r.passed);

  const flags: SentinelFlag[] = failedRules.map((rule) => ({
    category: "compliance_violation" as const,
    severity: "high" as const,
    detail: `${rule.name}: ${rule.detail ?? "Check failed"}`,
    suggested_action: null,
  }));

  return {
    rules_checked: allRules,
    passed: failedRules.length === 0,
    flags,
  };
}
