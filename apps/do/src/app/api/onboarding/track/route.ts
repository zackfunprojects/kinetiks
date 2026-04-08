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

export async function POST(request: Request) {
  const auth = await requireDeskOfSession();
  if ("error" in auth) return auth.error;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  if (typeof raw !== "object" || raw === null) {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const trackRaw = (raw as { track?: unknown }).track;
  if (
    typeof trackRaw !== "string" ||
    !VALID_TRACKS.has(trackRaw as TrackLevel)
  ) {
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
      trackRaw as TrackLevel
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 403 }
    );
  }

  const result = await advanceOnboardingStep(supabase, auth.session.user_id, {
    step_completed: "track",
    patch: { track_selected_at: new Date().toISOString() },
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        error: "Onboarding step out of order",
        current_step: result.current_step,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    success: true,
    current_step: result.state.current_step,
  });
}
