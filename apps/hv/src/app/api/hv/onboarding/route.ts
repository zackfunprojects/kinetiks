import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { INITIAL_ONBOARDING_STATE } from "@/types/onboarding";
import type { HarvestOnboardingState, SenderProfile } from "@/types/onboarding";

/**
 * GET /api/hv/onboarding
 * Get the current onboarding state.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const { data } = await admin
    .from("hv_accounts_config")
    .select("onboarding_state, sender_profile")
    .eq("kinetiks_id", auth.account_id)
    .maybeSingle();

  if (data?.onboarding_state) {
    // Safe cast: onboarding_state JSONB follows HarvestOnboardingState schema
    return apiSuccess(data.onboarding_state as HarvestOnboardingState);
  }

  return apiSuccess(INITIAL_ONBOARDING_STATE);
}

/**
 * POST /api/hv/onboarding
 * Update onboarding state. Called after each step completion.
 *
 * Body:
 *   step: number (which step was just completed)
 *   data: object (step-specific data)
 *     Step 1: { sender_profile: SenderProfile }
 *     Step 2: { outreach_goal: OutreachGoal } (saved separately)
 *     Step 3: { icp_reviewed: true }
 *     Step 4: { templates_generated: true, template_count: number }
 *     Step 5: { first_enrichment_done: true, domain: string }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  try {
    const body = await request.json();
    const step = body.step as number;
    const stepData = body.data ?? {};

    if (!step || step < 1 || step > 5) {
      return apiError("step must be 1-5", 400);
    }

    const admin = createAdminClient();

    // Load current state
    const { data: configRow } = await admin
      .from("hv_accounts_config")
      .select("onboarding_state, sender_profile, outreach_goal")
      .eq("kinetiks_id", auth.account_id)
      .maybeSingle();

    // Safe cast: JSONB follows known schema
    const currentState = (configRow?.onboarding_state as HarvestOnboardingState) ?? { ...INITIAL_ONBOARDING_STATE };
    const completedSteps = new Set(currentState.completed_steps ?? []);
    completedSteps.add(step);

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Process step-specific data
    if (step === 1 && stepData.sender_profile) {
      const profile = stepData.sender_profile as SenderProfile;
      updates.sender_profile = profile;
    }

    if (step === 2 && stepData.outreach_goal) {
      updates.outreach_goal = stepData.outreach_goal;
    }

    // Update onboarding state
    const newState: HarvestOnboardingState = {
      current_step: Math.min(step + 1, 6),
      completed_steps: Array.from(completedSteps).sort((a, b) => a - b),
      sender_profile: step === 1 ? stepData.sender_profile : currentState.sender_profile,
      outreach_goal_configured: completedSteps.has(2) || currentState.outreach_goal_configured,
      icp_reviewed: completedSteps.has(3) || currentState.icp_reviewed,
      templates_generated: completedSteps.has(4) || currentState.templates_generated,
      first_enrichment_done: completedSteps.has(5) || currentState.first_enrichment_done,
      completed: completedSteps.size >= 5,
    };

    updates.onboarding_state = newState;

    // Upsert config
    const { error: upsertError } = await admin
      .from("hv_accounts_config")
      .upsert(
        {
          kinetiks_id: auth.account_id,
          ...updates,
        },
        { onConflict: "kinetiks_id" }
      );

    if (upsertError) return apiError(upsertError.message, 500);

    return apiSuccess(newState);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Invalid request", 400);
  }
}
