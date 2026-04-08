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

/**
 * The canonical onboarding step order for Phase 2.
 *
 * NOTE on the calibration step: per Final Supplement #4 the full
 * onboarding flow includes a 10-thread expertise calibration exercise.
 * That step requires Scout to surface real candidate threads from the
 * user's connected platforms, which depends on the Reddit API client
 * follow-up + Phase 4 Scout intelligence work. Until that lands,
 * `calibration` is intentionally NOT in the active STEP_ORDER. The
 * type literal remains so the schema check constraint stays compatible
 * for the future migration that re-introduces it.
 */
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

/**
 * Idempotent bootstrap: returns the existing onboarding state if any,
 * otherwise creates a fresh one. Race-tolerant under concurrent first
 * requests via upsert + onConflict on the user_id unique index.
 */
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
    .upsert(
      { user_id: userId, current_step: "privacy" },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    // Fall back to a fresh read in case the upsert lost a race.
    const { data: recovered } = await supabase
      .from("deskof_onboarding_state")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (recovered) return recovered as OnboardingState;
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

export type AdvanceResult =
  | { ok: true; state: OnboardingState }
  | {
      ok: false;
      reason:
        | "wrong_step"
        | "raced"
        | "not_found";
      current_step?: OnboardingStep;
    };

/**
 * Mark a step complete and advance to the next step in the canonical
 * order.
 *
 * Strict: the caller must claim the step they're currently on. A user
 * sitting on `privacy` cannot claim `track` to jump ahead. The DB
 * UPDATE is conditional on `current_step = step_completed` so that
 * concurrent slower requests can't overwrite newer progress.
 *
 * Returns ok=false on contention so the caller can decide whether to
 * surface a redirect, retry, or error.
 */
export async function advanceOnboardingStep(
  supabase: SupabaseClient,
  userId: string,
  input: AdvanceInput
): Promise<AdvanceResult> {
  const current = await getOrCreateOnboardingState(supabase, userId);

  if (current.current_step !== input.step_completed) {
    return {
      ok: false,
      reason: "wrong_step",
      current_step: current.current_step,
    };
  }

  const nextStep = nextStepAfter(input.step_completed);

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
    // Atomic guard: only advance if the row is still on the step the
    // caller claimed. A slower earlier request that found `privacy`
    // can't overwrite `content` after a faster request advanced past it.
    .eq("current_step", input.step_completed)
    .select("*");

  if (error) {
    throw new Error(`onboarding advance failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return { ok: false, reason: "raced", current_step: current.current_step };
  }

  return { ok: true, state: data[0] as OnboardingState };
}

/**
 * Convenience wrapper for callers that want the throwing behavior of
 * the original API. Maps wrong_step / raced to a thrown error so
 * existing call sites that don't yet branch on the result keep working.
 */
export async function advanceOnboardingStepOrThrow(
  supabase: SupabaseClient,
  userId: string,
  input: AdvanceInput
): Promise<OnboardingState> {
  const result = await advanceOnboardingStep(supabase, userId, input);
  if (!result.ok) {
    throw new Error(
      `Cannot advance onboarding from ${result.current_step ?? "unknown"} via ${input.step_completed}: ${result.reason}`
    );
  }
  return result.state;
}

export function nextStepAfter(step: OnboardingStep): OnboardingStep {
  const idx = STEP_ORDER.indexOf(step);
  return STEP_ORDER[Math.min(idx + 1, STEP_ORDER.length - 1)];
}
