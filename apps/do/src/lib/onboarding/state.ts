/**
 * Onboarding state machine.
 *
 * Per Final Supplement #4 — 6 steps, < 8 min total. Steps:
 *
 *   1. privacy      — Privacy disclosure + Reddit OAuth + Quora URL
 *   2. content      — 1-5 content URLs (Standard+)
 *   3. calibration  — 10-thread expertise labeling
 *   4. interests    — Personal interests
 *   5. track        — Track selection (default Standard with 7-day trial)
 *   6. complete     — Land on Write tab with first card
 *
 * State persists in deskof_onboarding_state. Each completed step
 * advances current_step. The user can resume from where they left off.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type OnboardingStep =
  | "privacy"
  | "connect"
  | "content"
  | "calibration"
  | "interests"
  | "track"
  | "complete";

const STEP_ORDER: OnboardingStep[] = [
  "privacy",
  "connect",
  "content",
  "calibration",
  "interests",
  "track",
  "complete",
];

export interface OnboardingState {
  user_id: string;
  current_step: OnboardingStep;
  privacy_acknowledged_at: string | null;
  privacy_disclosure_version: string | null;
  reddit_connected_at: string | null;
  quora_connected_at: string | null;
  content_urls_submitted_at: string | null;
  calibration_completed_at: string | null;
  interests_submitted_at: string | null;
  track_selected_at: string | null;
  completed_at: string | null;
  abandoned_at: string | null;
}

export async function getOrCreateOnboardingState(
  supabase: SupabaseClient,
  userId: string
): Promise<OnboardingState> {
  const { data: existing, error: readError } = await supabase
    .from("deskof_onboarding_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    throw new Error(`onboarding state read failed: ${readError.message}`);
  }
  if (existing) return existing as OnboardingState;

  const { data, error } = await supabase
    .from("deskof_onboarding_state")
    .insert({ user_id: userId, current_step: "privacy" })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `onboarding state create failed: ${error?.message ?? "no data"}`
    );
  }
  return data as OnboardingState;
}

interface AdvanceInput {
  step_completed: Exclude<OnboardingStep, "complete">;
  /** Patch fields to set alongside the step advancement */
  patch?: Partial<OnboardingState>;
}

/**
 * Mark a step complete and advance to the next step in the canonical
 * order. Idempotent — re-completing a step is a no-op.
 */
export async function advanceOnboardingStep(
  supabase: SupabaseClient,
  userId: string,
  input: AdvanceInput
): Promise<OnboardingState> {
  const current = await getOrCreateOnboardingState(supabase, userId);
  const currentIdx = STEP_ORDER.indexOf(current.current_step);
  const completedIdx = STEP_ORDER.indexOf(input.step_completed);

  // Don't go backwards
  const nextIdx = Math.max(currentIdx, completedIdx + 1);
  const nextStep = STEP_ORDER[Math.min(nextIdx, STEP_ORDER.length - 1)];

  const update: Partial<OnboardingState> = {
    ...input.patch,
    current_step: nextStep,
  };

  if (nextStep === "complete" && !current.completed_at) {
    update.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("deskof_onboarding_state")
    .update(update)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `onboarding advance failed: ${error?.message ?? "no data"}`
    );
  }
  return data as OnboardingState;
}

export function nextStepAfter(step: OnboardingStep): OnboardingStep {
  const idx = STEP_ORDER.indexOf(step);
  return STEP_ORDER[Math.min(idx + 1, STEP_ORDER.length - 1)];
}
