import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { getOperatorTrack } from "@/lib/tracks/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/account/me — return the minimal session shape needed by
 * client components.
 *
 * Includes the user's currently selected track so AnalyticsBootstrap
 * can stamp the full Final Supplement §5 implicit context (user_id,
 * tier, AND track) on every event. Without `track` here the analytics
 * pipeline would persist `user_track: null` for every event.
 */
export async function GET() {
  const auth = await requireDeskOfSession();
  if ("error" in auth) return auth.error;

  // The track lookup is best-effort — if the user hasn't picked a
  // track yet (still in onboarding) we return null and the bootstrap
  // re-runs once they select one.
  let trackLevel: "minimal" | "standard" | "hero" | null = null;
  try {
    const supabase = createDeskOfServerClient();
    const track = await getOperatorTrack(supabase, auth.session.user_id);
    trackLevel = track.level;
  } catch {
    // Don't fail the whole endpoint just because track lookup errored
  }

  return NextResponse.json({
    user_id: auth.session.user_id,
    email: auth.session.email,
    tier: auth.session.tier,
    track: trackLevel,
  });
}
