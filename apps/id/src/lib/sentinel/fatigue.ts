import type {
  EngagementLevel,
  FatigueCheckResult,
  FatigueDecision,
  SentinelFlag,
  TouchpointSentiment,
} from "@kinetiks/types";
import { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_FATIGUE_LIMITS, ENGAGEMENT_MULTIPLIERS } from "./thresholds";

interface FatigueInput {
  accountId: string;
  contactEmail?: string;
  contactLinkedin?: string;
  orgDomain?: string;
}

interface FatigueLimits {
  max_contact_touchpoints_7d: number;
  max_contact_touchpoints_24h: number;
  max_org_touchpoints_7d: number;
  min_gap_hours: number;
  negative_cooldown_days: number;
  max_consecutive_no_response: number;
}

/**
 * Run contact fatigue governance check.
 *
 * Queries the touchpoint ledger to determine if a new touchpoint
 * to this contact/org is allowed, given the configurable fatigue rules.
 * Adjusts thresholds based on engagement level.
 */
export async function evaluateFatigue(
  admin: SupabaseClient,
  input: FatigueInput
): Promise<FatigueCheckResult> {
  // If no contact info, fatigue check is N/A
  if (!input.contactEmail && !input.contactLinkedin && !input.orgDomain) {
    return {
      decision: "allowed",
      reason: "No contact info provided - fatigue check skipped",
      next_allowed_at: null,
      contact_touchpoints_7d: 0,
      contact_touchpoints_24h: 0,
      org_touchpoints_7d: 0,
      engagement_level: "normal",
      flags: [],
    };
  }

  // Load custom fatigue rules or use defaults
  const limits = await loadLimits(admin, input.accountId);

  // Calculate engagement level
  const engagement = await calculateEngagement(admin, input);

  // Apply engagement multiplier to limits
  const multiplier = ENGAGEMENT_MULTIPLIERS[engagement] ?? 1.0;
  const adjustedLimits = {
    max_contact_7d: Math.round(limits.max_contact_touchpoints_7d * multiplier),
    max_contact_24h: Math.round(limits.max_contact_touchpoints_24h * multiplier),
    max_org_7d: Math.round(limits.max_org_touchpoints_7d * multiplier),
    min_gap_hours: limits.min_gap_hours,
    negative_cooldown_days: limits.negative_cooldown_days,
    max_consecutive_no_response: limits.max_consecutive_no_response,
  };

  // Negative engagement = immediate block
  if (engagement === "negative") {
    const cooldownEnd = await getNegativeCooldownEnd(admin, input, limits.negative_cooldown_days);
    return {
      decision: "blocked",
      reason: "Contact has negative engagement - in cool-down period",
      next_allowed_at: cooldownEnd,
      contact_touchpoints_7d: 0,
      contact_touchpoints_24h: 0,
      org_touchpoints_7d: 0,
      engagement_level: engagement,
      flags: [
        {
          category: "fatigue_exceeded",
          severity: "high",
          detail: "Contact has negative sentiment (unsubscribe, complaint, or hostile reply)",
          suggested_action: `Wait until cool-down expires${cooldownEnd ? ` (${cooldownEnd})` : ""}`,
        },
      ],
    };
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Query contact touchpoints
  let contactTouchpoints7d = 0;
  let contactTouchpoints24h = 0;
  let lastContactTouchpoint: string | null = null;

  if (input.contactEmail || input.contactLinkedin) {
    const contactQuery = admin
      .from("kinetiks_touchpoint_ledger")
      .select("timestamp", { count: "exact", head: false })
      .eq("account_id", input.accountId)
      .gte("timestamp", sevenDaysAgo)
      .order("timestamp", { ascending: false });

    if (input.contactEmail) {
      contactQuery.eq("contact_email", input.contactEmail);
    } else if (input.contactLinkedin) {
      contactQuery.eq("contact_linkedin", input.contactLinkedin);
    }

    const { data: contactData, count } = await contactQuery;
    contactTouchpoints7d = count ?? 0;

    if (contactData && contactData.length > 0) {
      lastContactTouchpoint = contactData[0].timestamp as string;

      // Count 24h touchpoints
      contactTouchpoints24h = contactData.filter(
        (t) => (t.timestamp as string) >= oneDayAgo
      ).length;
    }
  }

  // Query org touchpoints
  let orgTouchpoints7d = 0;
  if (input.orgDomain) {
    const { count } = await admin
      .from("kinetiks_touchpoint_ledger")
      .select("id", { count: "exact", head: true })
      .eq("account_id", input.accountId)
      .eq("org_domain", input.orgDomain)
      .gte("timestamp", sevenDaysAgo);

    orgTouchpoints7d = count ?? 0;
  }

  // Check consecutive no-response
  const consecutiveNoResponse = await getConsecutiveNoResponse(admin, input);

  const flags: SentinelFlag[] = [];
  let decision: FatigueDecision = "allowed";
  let reason: string | null = null;
  let nextAllowedAt: string | null = null;

  // Check min gap
  if (lastContactTouchpoint) {
    const lastTime = new Date(lastContactTouchpoint).getTime();
    const gapMs = now.getTime() - lastTime;
    const minGapMs = adjustedLimits.min_gap_hours * 60 * 60 * 1000;

    if (gapMs < minGapMs) {
      decision = "delayed";
      nextAllowedAt = new Date(lastTime + minGapMs).toISOString();
      reason = `Minimum gap of ${adjustedLimits.min_gap_hours}h not met. Last touchpoint: ${lastContactTouchpoint}`;
      flags.push({
        category: "fatigue_exceeded",
        severity: "medium",
        detail: reason,
        suggested_action: `Delay until ${nextAllowedAt}`,
      });
    }
  }

  // Check 24h limit
  if (contactTouchpoints24h >= adjustedLimits.max_contact_24h) {
    decision = "delayed";
    reason = `Contact has ${contactTouchpoints24h} touchpoints in 24h (limit: ${adjustedLimits.max_contact_24h})`;
    flags.push({
      category: "fatigue_exceeded",
      severity: "medium",
      detail: reason,
      suggested_action: "Delay to next day",
    });
  }

  // Check 7d contact limit
  if (contactTouchpoints7d >= adjustedLimits.max_contact_7d) {
    decision = "blocked";
    reason = `Contact has ${contactTouchpoints7d} touchpoints in 7 days (limit: ${adjustedLimits.max_contact_7d})`;
    flags.push({
      category: "fatigue_exceeded",
      severity: "high",
      detail: reason,
      suggested_action: "Wait until next week",
    });
  }

  // Check 7d org limit
  if (orgTouchpoints7d >= adjustedLimits.max_org_7d) {
    decision = "blocked";
    reason = `Organization has ${orgTouchpoints7d} touchpoints in 7 days (limit: ${adjustedLimits.max_org_7d})`;
    flags.push({
      category: "fatigue_exceeded",
      severity: "high",
      detail: reason,
      suggested_action: "Wait until next week",
    });
  }

  // Check consecutive no-response
  if (consecutiveNoResponse >= adjustedLimits.max_consecutive_no_response) {
    decision = "blocked";
    reason = `${consecutiveNoResponse} consecutive touchpoints with no response (limit: ${adjustedLimits.max_consecutive_no_response})`;
    flags.push({
      category: "fatigue_exceeded",
      severity: "high",
      detail: reason,
      suggested_action: "Auto-pause this contact",
    });
  }

  return {
    decision,
    reason,
    next_allowed_at: nextAllowedAt,
    contact_touchpoints_7d: contactTouchpoints7d,
    contact_touchpoints_24h: contactTouchpoints24h,
    org_touchpoints_7d: orgTouchpoints7d,
    engagement_level: engagement,
    flags,
  };
}

/**
 * Load custom fatigue rules for an account, falling back to defaults.
 */
async function loadLimits(
  admin: SupabaseClient,
  accountId: string
): Promise<FatigueLimits> {
  const { data: rules } = await admin
    .from("kinetiks_fatigue_rules")
    .select("rule_name, limit_value")
    .eq("account_id", accountId)
    .eq("is_active", true);

  const defaults = { ...DEFAULT_FATIGUE_LIMITS };

  if (!rules || rules.length === 0) return defaults;

  const ruleMap = new Map(
    rules.map((r) => [r.rule_name as string, r.limit_value as number])
  );

  return {
    max_contact_touchpoints_7d:
      ruleMap.get("max_contact_touchpoints_7d") ??
      defaults.max_contact_touchpoints_7d,
    max_contact_touchpoints_24h:
      ruleMap.get("max_contact_touchpoints_24h") ??
      defaults.max_contact_touchpoints_24h,
    max_org_touchpoints_7d:
      ruleMap.get("max_org_touchpoints_7d") ?? defaults.max_org_touchpoints_7d,
    min_gap_hours:
      ruleMap.get("min_gap_hours") ?? defaults.min_gap_hours,
    negative_cooldown_days:
      ruleMap.get("negative_cooldown_days") ?? defaults.negative_cooldown_days,
    max_consecutive_no_response:
      ruleMap.get("max_consecutive_no_response") ??
      defaults.max_consecutive_no_response,
  };
}

/**
 * Calculate engagement level based on sentiment history.
 */
async function calculateEngagement(
  admin: SupabaseClient,
  input: FatigueInput
): Promise<EngagementLevel> {
  if (!input.contactEmail && !input.contactLinkedin) return "normal";

  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const query = admin
    .from("kinetiks_touchpoint_ledger")
    .select("sentiment")
    .eq("account_id", input.accountId)
    .gte("timestamp", thirtyDaysAgo);

  if (input.contactEmail) {
    query.eq("contact_email", input.contactEmail);
  } else if (input.contactLinkedin) {
    query.eq("contact_linkedin", input.contactLinkedin);
  }

  const { data: touchpoints } = await query;

  if (!touchpoints || touchpoints.length === 0) return "normal";

  const sentiments = touchpoints.map(
    (t) => t.sentiment as TouchpointSentiment
  );

  // Any negative sentiment = negative engagement
  if (sentiments.includes("negative")) return "negative";

  const positiveCount = sentiments.filter((s) => s === "positive").length;
  const ratio = positiveCount / sentiments.length;

  if (ratio >= 0.5) return "high";
  if (ratio >= 0.1) return "normal";
  return "low";
}

/**
 * Get end date of negative cool-down for a contact.
 */
async function getNegativeCooldownEnd(
  admin: SupabaseClient,
  input: FatigueInput,
  cooldownDays: number
): Promise<string | null> {
  if (!input.contactEmail && !input.contactLinkedin) return null;

  const query = admin
    .from("kinetiks_touchpoint_ledger")
    .select("timestamp")
    .eq("account_id", input.accountId)
    .eq("sentiment", "negative")
    .order("timestamp", { ascending: false })
    .limit(1);

  if (input.contactEmail) {
    query.eq("contact_email", input.contactEmail);
  } else if (input.contactLinkedin) {
    query.eq("contact_linkedin", input.contactLinkedin);
  }

  const { data } = await query;

  if (!data || data.length === 0) return null;

  const negativeAt = new Date(data[0].timestamp as string);
  const cooldownEnd = new Date(
    negativeAt.getTime() + cooldownDays * 24 * 60 * 60 * 1000
  );

  return cooldownEnd.toISOString();
}

/**
 * Count consecutive touchpoints with neutral (no response) sentiment.
 */
async function getConsecutiveNoResponse(
  admin: SupabaseClient,
  input: FatigueInput
): Promise<number> {
  if (!input.contactEmail && !input.contactLinkedin) return 0;

  const query = admin
    .from("kinetiks_touchpoint_ledger")
    .select("sentiment")
    .eq("account_id", input.accountId)
    .order("timestamp", { ascending: false })
    .limit(20);

  if (input.contactEmail) {
    query.eq("contact_email", input.contactEmail);
  } else if (input.contactLinkedin) {
    query.eq("contact_linkedin", input.contactLinkedin);
  }

  const { data } = await query;
  if (!data) return 0;

  let count = 0;
  for (const touchpoint of data) {
    if (touchpoint.sentiment === "neutral") {
      count++;
    } else {
      break;
    }
  }

  return count;
}
