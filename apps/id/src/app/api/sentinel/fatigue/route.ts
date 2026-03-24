import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import type { TouchpointSentiment } from "@kinetiks/types";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

const VALID_CHANNELS = new Set([
  "email",
  "linkedin_message",
  "linkedin_connect",
  "linkedin_view",
  "phone_call",
  "content_retarget",
  "landing_page_followup",
]);

const VALID_SENTIMENTS = new Set<TouchpointSentiment>([
  "positive",
  "neutral",
  "negative",
]);

/**
 * GET /api/sentinel/fatigue
 *
 * List fatigue rules for the authenticated user's account.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const { data: rules, error: rulesError } = await admin
    .from("kinetiks_fatigue_rules")
    .select("*")
    .eq("account_id", auth.account_id)
    .order("rule_name");

  if (rulesError) {
    return apiError("Failed to fetch fatigue rules", 500);
  }

  return apiSuccess({ rules: rules ?? [] });
}

/**
 * PUT /api/sentinel/fatigue
 *
 * Update fatigue rules for the authenticated user's account.
 * Body: { rules: Array<{ rule_name: string, limit_value: number, period: string, scope: 'contact' | 'org', is_active?: boolean }> }
 */
export async function PUT(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: {
    rules: Array<{
      rule_name: string;
      limit_value: number;
      period: string;
      scope: "contact" | "org";
      is_active?: boolean;
    }>;
  };
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!Array.isArray(body.rules) || body.rules.length === 0) {
    return apiError("rules must be a non-empty array", 400);
  }

  const VALID_PERIODS = ["1h", "6h", "12h", "24h", "3d", "7d", "14d", "30d"];
  const VALID_SCOPES = ["contact", "org"];

  // Validate each rule before processing
  for (let i = 0; i < body.rules.length; i++) {
    const rule = body.rules[i];
    if (!rule || typeof rule !== "object") {
      return apiError(`rules[${i}]: must be an object`, 400);
    }
    if (typeof rule.rule_name !== "string" || rule.rule_name.trim().length === 0) {
      return apiError(`rules[${i}]: rule_name must be a non-empty string`, 400);
    }
    if (typeof rule.limit_value !== "number" || !Number.isFinite(rule.limit_value) || rule.limit_value < 0) {
      return apiError(`rules[${i}]: limit_value must be a non-negative number`, 400);
    }
    if (typeof rule.period !== "string" || !VALID_PERIODS.includes(rule.period)) {
      return apiError(`rules[${i}]: period must be one of ${VALID_PERIODS.join(", ")}`, 400);
    }
    if (typeof rule.scope !== "string" || !VALID_SCOPES.includes(rule.scope)) {
      return apiError(`rules[${i}]: scope must be "contact" or "org"`, 400);
    }
    if (rule.is_active !== undefined && typeof rule.is_active !== "boolean") {
      return apiError(`rules[${i}]: is_active must be a boolean if provided`, 400);
    }
  }

  const admin = createAdminClient();
  const accountId = auth.account_id;

  // Upsert each rule (all validated above)
  const upsertRows = body.rules.map((rule) => ({
    account_id: accountId,
    rule_name: rule.rule_name,
    limit_value: rule.limit_value,
    period: rule.period,
    scope: rule.scope,
    is_active: rule.is_active ?? true,
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await admin
    .from("kinetiks_fatigue_rules")
    .upsert(upsertRows, { onConflict: "account_id,rule_name" });

  if (upsertError) {
    return apiError("Failed to update fatigue rules", 500);
  }

  return apiSuccess({ updated: upsertRows.length });
}

/**
 * POST /api/sentinel/fatigue
 *
 * Record a touchpoint in the unified touchpoint ledger.
 * Called by apps after actually sending/executing an external action.
 *
 * Auth: user session, API key, or internal service secret
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: {
    account_id: string;
    contact_email?: string;
    contact_linkedin?: string;
    org_domain?: string;
    app: string;
    channel: string;
    action_type: string;
    sentiment?: TouchpointSentiment;
    sentinel_review_id?: string;
  };

  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (
    !body ||
    typeof body !== "object" ||
    !body.account_id ||
    !body.app ||
    !body.channel ||
    !body.action_type
  ) {
    return apiError("Missing required fields: account_id, app, channel, action_type", 400);
  }

  if (!VALID_CHANNELS.has(body.channel)) {
    return apiError(`Invalid channel: ${body.channel}. Must be one of: ${[...VALID_CHANNELS].join(", ")}`, 400);
  }

  if (body.sentiment !== undefined && !VALID_SENTIMENTS.has(body.sentiment)) {
    return apiError(`Invalid sentiment: ${body.sentiment}. Must be positive, neutral, or negative`, 400);
  }

  const admin = createAdminClient();

  // Verify account ownership if not internal
  if (auth.auth_method !== "internal") {
    const { data: account } = await admin
      .from("kinetiks_accounts")
      .select("id")
      .eq("id", body.account_id)
      .eq("user_id", auth.user_id)
      .single();

    if (!account) {
      return apiError("Forbidden: account does not belong to you", 403);
    }
  }

  const { error: insertError } = await admin
    .from("kinetiks_touchpoint_ledger")
    .insert({
      account_id: body.account_id,
      contact_email: body.contact_email ?? null,
      contact_linkedin: body.contact_linkedin ?? null,
      org_domain: body.org_domain ?? null,
      app: body.app,
      channel: body.channel,
      action_type: body.action_type,
      sentiment: body.sentiment ?? "neutral",
      sentinel_review_id: body.sentinel_review_id ?? null,
    });

  if (insertError) {
    return apiError("Failed to record touchpoint", 500);
  }

  return apiSuccess({ recorded: true });
}
