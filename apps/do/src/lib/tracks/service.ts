/**
 * Track persistence + tier-aware selection.
 *
 * The user's Track controls Scout's discovery aperture and weekly
 * opportunity budget. Tracks are bounded by tier:
 *
 *   free     → minimal only
 *   standard → up to standard
 *   hero     → up to hero
 *
 * canSelectTrack() lives in @kinetiks/deskof so the same enforcement
 * runs in the UI, the API route, and the Scout queue builder.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TRACK_CONFIGS,
  canSelectTrack,
  type Track,
  type TrackLevel,
  type BillingTier,
} from "@kinetiks/deskof";

/**
 * Read the user's current track. Defaults to minimal if no row exists
 * (lets new users get a sensible queue before they explicitly pick).
 */
export async function getOperatorTrack(
  supabase: SupabaseClient,
  userId: string
): Promise<Track> {
  const { data, error } = await supabase
    .from("deskof_operator_tracks")
    .select("track")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`getOperatorTrack failed: ${error.message}`);
  }

  const level = (data?.track as TrackLevel | undefined) ?? "minimal";
  return TRACK_CONFIGS[level];
}

/**
 * Set the user's track. Throws if the requested level is above the
 * user's billing tier ceiling.
 */
export async function setOperatorTrack(
  supabase: SupabaseClient,
  userId: string,
  tier: BillingTier,
  level: TrackLevel
): Promise<Track> {
  if (!canSelectTrack(tier, level)) {
    throw new Error(
      `Tier "${tier}" cannot select track "${level}"`
    );
  }

  const { error } = await supabase
    .from("deskof_operator_tracks")
    .upsert(
      { user_id: userId, track: level },
      { onConflict: "user_id" }
    );

  if (error) {
    throw new Error(`setOperatorTrack failed: ${error.message}`);
  }

  return TRACK_CONFIGS[level];
}
