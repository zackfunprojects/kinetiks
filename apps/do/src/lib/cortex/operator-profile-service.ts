/**
 * Server-side persistence for the Operator Profile primitive.
 *
 * The Operator Profile schema lives in @kinetiks/cortex (typed). This
 * module is the apps/do-side adapter that maps between the Cortex types
 * and the deskof_operator_profiles table.
 *
 * Mirror calls these functions during onboarding (cold start) and from
 * background jobs (behavioral learning, content ingestion).
 *
 * Concurrency model:
 *   - ensureOperatorProfile uses upsert+select (idempotent under load)
 *   - updateOperatorProfile uses optimistic concurrency on lock_version
 *     with bounded retry. Concurrent updates never silently drop each
 *     other — losers re-read and re-merge.
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
  lock_version: number;
  created_at: string;
  updated_at: string;
}

interface RowWithLock {
  profile: OperatorProfile;
  lock_version: number;
}

const MAX_UPDATE_RETRIES = 5;

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

function rowToWithLock(row: ProfileRow): RowWithLock {
  return { profile: rowToProfile(row), lock_version: row.lock_version };
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

async function getOperatorProfileWithLock(
  supabase: SupabaseClient,
  userId: string
): Promise<RowWithLock | null> {
  const { data, error } = await supabase
    .from("deskof_operator_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `getOperatorProfileWithLock failed for ${userId}: ${error.message}`
    );
  }
  return data ? rowToWithLock(data as ProfileRow) : null;
}

/**
 * Read the operator profile, creating an empty one if it does not
 * exist. Idempotent and race-tolerant — uses upsert with onConflict
 * so two concurrent first-creators both see the same row instead of
 * one of them throwing on the unique constraint.
 */
export async function ensureOperatorProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<OperatorProfile> {
  const existing = await getOperatorProfile(supabase, userId);
  if (existing) return existing;

  const fresh = newOperatorProfile(crypto.randomUUID(), userId);
  // Upsert with ignoreDuplicates: false so the SELECT returns the row
  // whether the insert was new or a no-op due to a concurrent insert.
  const { data, error } = await supabase
    .from("deskof_operator_profiles")
    .upsert(
      {
        user_id: userId,
        professional: fresh.professional,
        personal: fresh.personal,
        gate_adjustments: fresh.gate_adjustments,
        confidence: 0,
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    // If upsert fails for any reason, fall back to a fresh read — the
    // most likely cause is a race we lost.
    const recovered = await getOperatorProfile(supabase, userId);
    if (recovered) return recovered;
    throw new Error(
      `ensureOperatorProfile failed for ${userId}: ${error?.message ?? "no data"}`
    );
  }
  return rowToProfile(data as ProfileRow);
}

/**
 * A pure transform from the current Operator Profile snapshot to its
 * next state. Called inside the CAS retry loop with the FRESHEST read
 * each iteration so concurrent appends never drop each other.
 */
export type OperatorProfileTransform = (
  current: OperatorProfile
) => OperatorProfile;

/**
 * Apply a transform to the operator profile under optimistic concurrency
 * control. Recomputes confidence after each update so the cold-start
 * trajectory is always current.
 *
 * Implementation:
 *   1. Read the current row + lock_version
 *   2. Run the transform on the FRESHEST snapshot
 *   3. UPDATE … WHERE lock_version = expected, returning the new row
 *   4. If the row count is 0, another writer landed first — retry
 *      from step 1 (bounded by MAX_UPDATE_RETRIES)
 *
 * The transform must be a pure function of `current`. Closures over a
 * stale snapshot defeat the CAS loop and silently drop concurrent
 * writes — that was the original CodeRabbit critical finding.
 */
export async function updateOperatorProfile(
  supabase: SupabaseClient,
  userId: string,
  transform: OperatorProfileTransform
): Promise<OperatorProfile> {
  // Make sure the row exists first; ensure is race-tolerant.
  await ensureOperatorProfile(supabase, userId);

  for (let attempt = 0; attempt < MAX_UPDATE_RETRIES; attempt++) {
    const current = await getOperatorProfileWithLock(supabase, userId);
    if (!current) {
      throw new Error(
        `updateOperatorProfile: profile vanished mid-update for ${userId}`
      );
    }

    // Run the caller's transform against the FRESHEST snapshot. This is
    // the difference between "patch from stale read" (drops concurrent
    // writes) and "transform from latest" (CAS-correct).
    const transformed = transform(current.profile);
    const next: OperatorProfile = {
      ...transformed,
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
        lock_version: current.lock_version + 1,
      })
      .eq("user_id", userId)
      .eq("lock_version", current.lock_version)
      .select("*");

    if (error) {
      throw new Error(
        `updateOperatorProfile DB error for ${userId}: ${error.message}`
      );
    }

    if (data && data.length === 1) {
      return rowToProfile(data[0] as ProfileRow);
    }

    // Lost the race — another writer bumped lock_version. Retry.
  }

  throw new Error(
    `updateOperatorProfile: optimistic-lock retries exhausted for ${userId}`
  );
}

/**
 * Convenience: append expertise tiers without overwriting existing ones.
 * Uses the transform model so concurrent appends from Mirror v0 (e.g.
 * calibration responses landing while behavioral learning runs) never
 * drop each other.
 */
export async function addExpertiseTiers(
  supabase: SupabaseClient,
  userId: string,
  tiers: ExpertiseTier[]
): Promise<OperatorProfile> {
  return updateOperatorProfile(supabase, userId, (latest) => ({
    ...latest,
    professional: {
      ...latest.professional,
      expertise_tiers: [...latest.professional.expertise_tiers, ...tiers],
    },
  }));
}

/**
 * Convenience: append personal interests, deduping by topic against
 * the FRESHEST profile each retry.
 */
export async function addPersonalInterests(
  supabase: SupabaseClient,
  userId: string,
  interests: Interest[]
): Promise<OperatorProfile> {
  return updateOperatorProfile(supabase, userId, (latest) => {
    const existing = new Set(
      latest.personal.interests.map((i) => i.topic.toLowerCase())
    );
    const merged = [
      ...latest.personal.interests,
      ...interests.filter((i) => !existing.has(i.topic.toLowerCase())),
    ];
    return {
      ...latest,
      personal: { ...latest.personal, interests: merged },
    };
  });
}
