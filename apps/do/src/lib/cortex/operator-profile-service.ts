/**
 * Server-side persistence for the Operator Profile primitive.
 *
 * The Operator Profile schema lives in @kinetiks/cortex (typed). This
 * module is the apps/do-side adapter that maps between the Cortex types
 * and the deskof_operator_profiles table.
 *
 * Mirror calls these functions during onboarding (cold start) and from
 * background jobs (behavioral learning, content ingestion).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  newOperatorProfile,
  computeProfileConfidence,
  type OperatorProfile,
  type ProfessionalProfile,
  type PersonalProfile,
  type GateAdjustments,
  type ExpertiseTier,
  type Interest,
} from "@kinetiks/cortex";

interface ProfileRow {
  id: string;
  user_id: string;
  professional: ProfessionalProfile;
  personal: PersonalProfile;
  gate_adjustments: GateAdjustments;
  confidence: number;
  created_at: string;
  updated_at: string;
}

function rowToProfile(row: ProfileRow): OperatorProfile {
  return {
    id: row.id,
    user_id: row.user_id,
    professional: row.professional,
    personal: row.personal,
    gate_adjustments: row.gate_adjustments,
    confidence: row.confidence,
    created_at: row.created_at,
    last_updated: row.updated_at,
  };
}

/**
 * Read the operator profile for a user, returning null if it does not
 * exist yet. Most callers want `ensureOperatorProfile` instead.
 */
export async function getOperatorProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<OperatorProfile | null> {
  const { data, error } = await supabase
    .from("deskof_operator_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `getOperatorProfile failed for ${userId}: ${error.message}`
    );
  }
  return data ? rowToProfile(data as ProfileRow) : null;
}

/**
 * Read the operator profile, creating an empty one if it does not
 * exist. Idempotent — safe to call from any code path that needs the
 * profile (Mirror, Scout, the Write tab).
 */
export async function ensureOperatorProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<OperatorProfile> {
  const existing = await getOperatorProfile(supabase, userId);
  if (existing) return existing;

  const fresh = newOperatorProfile(crypto.randomUUID(), userId);
  const { data, error } = await supabase
    .from("deskof_operator_profiles")
    .insert({
      user_id: userId,
      professional: fresh.professional,
      personal: fresh.personal,
      gate_adjustments: fresh.gate_adjustments,
      confidence: 0,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `ensureOperatorProfile failed for ${userId}: ${error?.message ?? "no data"}`
    );
  }
  return rowToProfile(data as ProfileRow);
}

interface UpdatePatch {
  professional?: Partial<ProfessionalProfile>;
  personal?: Partial<PersonalProfile>;
  gate_adjustments?: Partial<GateAdjustments>;
}

/**
 * Apply a partial patch to the operator profile. Recomputes confidence
 * after each update so the cold-start trajectory is always current.
 *
 * Patches merge top-level fields shallowly — callers that need to
 * append to a nested array should read the current value, splice their
 * change in, and write the full new array.
 */
export async function updateOperatorProfile(
  supabase: SupabaseClient,
  userId: string,
  patch: UpdatePatch
): Promise<OperatorProfile> {
  const current = await ensureOperatorProfile(supabase, userId);

  const next: OperatorProfile = {
    ...current,
    professional: { ...current.professional, ...(patch.professional ?? {}) },
    personal: { ...current.personal, ...(patch.personal ?? {}) },
    gate_adjustments: {
      ...current.gate_adjustments,
      ...(patch.gate_adjustments ?? {}),
    },
    last_updated: new Date().toISOString(),
  };
  next.confidence = computeProfileConfidence(next);

  const { data, error } = await supabase
    .from("deskof_operator_profiles")
    .update({
      professional: next.professional,
      personal: next.personal,
      gate_adjustments: next.gate_adjustments,
      confidence: next.confidence,
    })
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `updateOperatorProfile failed for ${userId}: ${error?.message ?? "no data"}`
    );
  }
  return rowToProfile(data as ProfileRow);
}

/**
 * Convenience: append expertise tiers without overwriting existing ones.
 * Mirror calls this from the calibration exercise (Phase 2 Mirror v0).
 */
export async function addExpertiseTiers(
  supabase: SupabaseClient,
  userId: string,
  tiers: ExpertiseTier[]
): Promise<OperatorProfile> {
  const current = await ensureOperatorProfile(supabase, userId);
  return updateOperatorProfile(supabase, userId, {
    professional: {
      ...current.professional,
      expertise_tiers: [...current.professional.expertise_tiers, ...tiers],
    },
  });
}

/**
 * Convenience: append personal interests, deduping by topic.
 */
export async function addPersonalInterests(
  supabase: SupabaseClient,
  userId: string,
  interests: Interest[]
): Promise<OperatorProfile> {
  const current = await ensureOperatorProfile(supabase, userId);
  const existing = new Set(
    current.personal.interests.map((i) => i.topic.toLowerCase())
  );
  const merged = [
    ...current.personal.interests,
    ...interests.filter((i) => !existing.has(i.topic.toLowerCase())),
  ];
  return updateOperatorProfile(supabase, userId, {
    personal: { ...current.personal, interests: merged },
  });
}
