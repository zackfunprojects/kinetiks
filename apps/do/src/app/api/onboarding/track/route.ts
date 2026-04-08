import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { advanceOnboardingStep } from "@/lib/onboarding/state";
import { setOperatorTrack } from "@/lib/tracks/service";
import type { TrackLevel } from "@kinetiks/deskof";

export const dynamic = "force-dynamic";

const VALID_TRACKS: ReadonlySet<TrackLevel> = new Set<TrackLevel>([
  "minimal",
  "standard",
  "hero",
]);

interface Body {
  track?: string;
}

export async function POST(request: Request) {
  const auth = await requireDeskOfSession();
  if ("error" in auth) return auth.error;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  if (!body.track || !VALID_TRACKS.has(body.track as TrackLevel)) {
    return NextResponse.json(
      { success: false, error: "Invalid track level" },
      { status: 400 }
    );
  }

  const supabase = createDeskOfServerClient();
  try {
    await setOperatorTrack(
      supabase,
      auth.session.user_id,
      auth.session.tier,
      body.track as TrackLevel
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 403 }
    );
  }

  await advanceOnboardingStep(supabase, auth.session.user_id, {
    step_completed: "track",
    patch: { track_selected_at: new Date().toISOString() },
  });

  return NextResponse.json({ success: true });
}
