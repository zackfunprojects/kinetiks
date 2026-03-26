import type {
  EscalationDeliveryChannel,
  EscalationSeverity,
  SentinelFlag,
  SentinelVerdict,
  FatigueCheckResult,
  ComplianceCheckResult,
} from "@kinetiks/types";
import { SupabaseClient } from "@supabase/supabase-js";

interface EscalationInput {
  accountId: string;
  sourceApp: string;
  sourceOperator?: string;
  reviewId: string;
  verdict: SentinelVerdict;
  qualityScore: number;
  flags: SentinelFlag[];
  fatigue: FatigueCheckResult | null;
  compliance: ComplianceCheckResult;
  contactEmail?: string;
  contactLinkedin?: string;
  orgDomain?: string;
}

interface EscalationResult {
  created: boolean;
  escalationId: string | null;
  severity: EscalationSeverity;
  deliveryChannel: EscalationDeliveryChannel;
}

/**
 * Deduplication window in milliseconds (1 hour).
 * Escalations about the same contact with the same severity
 * within this window are merged, not duplicated.
 */
const DEDUP_WINDOW_MS = 60 * 60 * 1000;

/**
 * Route a Sentinel review result to the escalation system.
 *
 * Only creates escalations for flagged or held verdicts.
 * Deduplicates against recent escalations for the same contact.
 * Determines severity and delivery channel.
 */
export async function routeEscalation(
  admin: SupabaseClient,
  input: EscalationInput
): Promise<EscalationResult> {
  // Approved content doesn't need escalation
  if (input.verdict === "approved") {
    return {
      created: false,
      escalationId: null,
      severity: "low",
      deliveryChannel: "digest",
    };
  }

  const severity = classifySeverity(input);
  const deliveryChannel = severityToChannel(severity);

  // Check for deduplication
  const isDuplicate = await checkDuplicate(
    admin,
    input.accountId,
    input.contactEmail,
    input.contactLinkedin,
    input.orgDomain,
    severity
  );

  if (isDuplicate) {
    return {
      created: false,
      escalationId: null,
      severity,
      deliveryChannel,
    };
  }

  // Build context payload
  const context: Record<string, unknown> = {
    review_id: input.reviewId,
    verdict: input.verdict,
    quality_score: input.qualityScore,
    flag_count: input.flags.length,
    flag_categories: input.flags.map((f) => f.category),
    contact_email: input.contactEmail ?? null,
    contact_linkedin: input.contactLinkedin ?? null,
    org_domain: input.orgDomain ?? null,
  };

  if (input.fatigue) {
    context.fatigue_decision = input.fatigue.decision;
    context.fatigue_reason = input.fatigue.reason;
  }

  if (!input.compliance.passed) {
    context.compliance_failures = input.compliance.rules_checked
      .filter((r) => !r.passed)
      .map((r) => r.name);
  }

  // Create escalation record
  const { data: escalation, error } = await admin
    .from("kinetiks_escalations")
    .insert({
      account_id: input.accountId,
      severity,
      source_app: input.sourceApp,
      source_operator: input.sourceOperator ?? null,
      sentinel_review_id: input.reviewId,
      context,
      status: "pending",
      delivery_channel: deliveryChannel,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create escalation:", error.message);
    return {
      created: false,
      escalationId: null,
      severity,
      deliveryChannel,
    };
  }

  return {
    created: true,
    escalationId: (escalation.id as string) ?? null,
    severity,
    deliveryChannel,
  };
}

/**
 * Classify escalation severity based on review results.
 *
 * Critical: legal risk, compliance breach, confidentiality leak
 * High: quality below floor, brand safety hold, aggressive competitive
 * Standard: flagged content, moderate concerns
 * Low: minor quality flags, fatigue delays
 */
function classifySeverity(input: EscalationInput): EscalationSeverity {
  const criticalCategories = [
    "confidentiality_risk",
    "legal_exposure",
  ];

  const highCategories = [
    "aggressive_competitive",
    "unsubstantiated_claims",
    "cultural_insensitivity",
    "pressure_manipulation",
  ];

  // Check for critical flags
  const hasCritical = input.flags.some(
    (f) =>
      criticalCategories.includes(f.category) &&
      (f.severity === "critical" || f.severity === "high")
  );
  if (hasCritical) return "critical";

  // Check for compliance failures
  if (!input.compliance.passed) {
    const criticalCompliance = input.compliance.rules_checked.some(
      (r) =>
        !r.passed &&
        (r.rule_id.startsWith("gdpr") || r.rule_id.startsWith("tcpa"))
    );
    if (criticalCompliance) return "critical";
    return "high";
  }

  // Check for high-severity brand safety flags
  const hasHigh = input.flags.some(
    (f) =>
      highCategories.includes(f.category) &&
      (f.severity === "high" || f.severity === "critical")
  );
  if (hasHigh) return "high";

  // Quality below floor = high
  if (input.verdict === "held" && input.qualityScore < 50) return "high";

  // Fatigue block = standard
  if (input.fatigue?.decision === "blocked") return "standard";

  // Everything else flagged = standard, held = high
  if (input.verdict === "held") return "high";

  return input.flags.some((f) => f.severity === "medium")
    ? "standard"
    : "low";
}

/**
 * Map severity to delivery channel.
 */
function severityToChannel(
  severity: EscalationSeverity
): EscalationDeliveryChannel {
  switch (severity) {
    case "critical":
      return "slack_dm";
    case "high":
      return "slack_dm";
    case "standard":
      return "slack_channel";
    case "low":
      return "digest";
  }
}

/**
 * Check if a similar escalation already exists in the dedup window.
 *
 * Only deduplicates when at least one stable contact identifier exists.
 * Without a contact key, account-wide dedup would suppress unrelated
 * escalations that happen to share the same severity.
 */
async function checkDuplicate(
  admin: SupabaseClient,
  accountId: string,
  contactEmail: string | undefined,
  contactLinkedin: string | undefined,
  orgDomain: string | undefined,
  severity: EscalationSeverity
): Promise<boolean> {
  // No stable contact identifier - skip dedup to avoid suppressing unrelated escalations
  if (!contactEmail && !contactLinkedin && !orgDomain) {
    return false;
  }

  const windowStart = new Date(
    Date.now() - DEDUP_WINDOW_MS
  ).toISOString();

  const query = admin
    .from("kinetiks_escalations")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("severity", severity)
    .eq("status", "pending")
    .gte("created_at", windowStart);

  // Narrow dedup scope by the most specific contact identifier available
  if (contactEmail) {
    query.contains("context", { contact_email: contactEmail });
  } else if (contactLinkedin) {
    query.contains("context", { contact_linkedin: contactLinkedin });
  } else if (orgDomain) {
    query.contains("context", { org_domain: orgDomain });
  }

  const { count, error } = await query;

  if (error) {
    // Fail open on dedup errors - better to have a duplicate than miss an escalation
    return false;
  }

  return (count ?? 0) > 0;
}
