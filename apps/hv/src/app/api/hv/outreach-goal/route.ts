import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { DEFAULT_OUTREACH_GOAL } from "@/types/outreach-goal";
import type { OutreachGoal, GoalType, SalesMotion } from "@/types/outreach-goal";

const VALID_GOAL_TYPES: GoalType[] = [
  "booked_call", "demo_request", "trial_signup", "reply", "form_submission", "purchase", "custom",
];
const VALID_SALES_MOTIONS: SalesMotion[] = [
  "consultative", "direct", "enterprise", "product_led", "custom",
];

/**
 * GET /api/hv/outreach-goal
 * Returns the account's outreach goal configuration.
 * Falls back to DEFAULT_OUTREACH_GOAL if none configured.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  // Outreach goal stored in hv_accounts or a dedicated config table
  // For now, store in the existing kinetiks_accounts metadata or hv-specific config
  const { data, error: selectError } = await admin
    .from("hv_accounts_config")
    .select("outreach_goal")
    .eq("kinetiks_id", auth.account_id)
    .maybeSingle();

  if (selectError) {
    console.error("Failed to fetch outreach goal:", selectError);
    return apiError(`Failed to fetch outreach goal: ${selectError.message}`, 500);
  }

  if (data?.outreach_goal) {
    // Safe cast: outreach_goal is JSONB stored in our schema
    return apiSuccess(data.outreach_goal as OutreachGoal);
  }

  return apiSuccess(DEFAULT_OUTREACH_GOAL);
}

/**
 * PUT /api/hv/outreach-goal
 * Save or update the account's outreach goal configuration.
 */
export async function PUT(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  try {
    const body = await request.json();

    // Validate goal_type
    if (body.goal_type && !VALID_GOAL_TYPES.includes(body.goal_type)) {
      return apiError(`Invalid goal_type. Must be one of: ${VALID_GOAL_TYPES.join(", ")}`, 400);
    }

    // Validate sales_motion
    if (body.sales_motion && !VALID_SALES_MOTIONS.includes(body.sales_motion)) {
      return apiError(`Invalid sales_motion. Must be one of: ${VALID_SALES_MOTIONS.join(", ")}`, 400);
    }

    // Merge with defaults for any missing fields
    const goal: OutreachGoal = {
      goal_type: body.goal_type ?? DEFAULT_OUTREACH_GOAL.goal_type,
      goal_label: body.goal_label ?? DEFAULT_OUTREACH_GOAL.goal_label,
      cta_url: body.cta_url ?? DEFAULT_OUTREACH_GOAL.cta_url,
      cta_copy: body.cta_copy ?? DEFAULT_OUTREACH_GOAL.cta_copy,
      cta_fallback: body.cta_fallback ?? DEFAULT_OUTREACH_GOAL.cta_fallback,
      sales_motion: body.sales_motion ?? DEFAULT_OUTREACH_GOAL.sales_motion,
      rules: {
        cold_no_cta_touches: body.rules?.cold_no_cta_touches ?? DEFAULT_OUTREACH_GOAL.rules.cold_no_cta_touches,
        require_engagement_for_cta: body.rules?.require_engagement_for_cta ?? DEFAULT_OUTREACH_GOAL.rules.require_engagement_for_cta,
        max_cta_ratio: body.rules?.max_cta_ratio ?? DEFAULT_OUTREACH_GOAL.rules.max_cta_ratio,
        post_cta_behavior: body.rules?.post_cta_behavior ?? DEFAULT_OUTREACH_GOAL.rules.post_cta_behavior,
        breakup_after_touches: body.rules?.breakup_after_touches ?? DEFAULT_OUTREACH_GOAL.rules.breakup_after_touches,
        call_always_pitch: body.rules?.call_always_pitch ?? DEFAULT_OUTREACH_GOAL.rules.call_always_pitch,
      },
    };

    const admin = createAdminClient();

    // Upsert config
    const { error: upsertError } = await admin
      .from("hv_accounts_config")
      .upsert(
        {
          kinetiks_id: auth.account_id,
          outreach_goal: goal,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "kinetiks_id" }
      );

    if (upsertError) return apiError(upsertError.message, 500);

    return apiSuccess(goal);
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Invalid request body",
      400
    );
  }
}
