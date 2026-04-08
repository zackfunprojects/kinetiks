import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { advanceOnboardingStep } from "@/lib/onboarding/state";
import { submitPersonalInterests } from "@/lib/mirror/cold-start";

export const dynamic = "force-dynamic";

const MAX_TOPICS = 25;
const MAX_TOPIC_LENGTH = 80;

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

  const rawTopics = (raw as { topics?: unknown }).topics;
  if (rawTopics !== undefined && !Array.isArray(rawTopics)) {
    return NextResponse.json(
      { success: false, error: "topics must be an array" },
      { status: 400 }
    );
  }

  const topics = ((rawTopics ?? []) as unknown[])
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= MAX_TOPIC_LENGTH)
    .slice(0, MAX_TOPICS);

  const supabase = createDeskOfServerClient();
  if (topics.length > 0) {
    await submitPersonalInterests(supabase, auth.session.user_id, topics);
  }

  // Note: the calibration step is intentionally NOT advanced here.
  // It's been removed from the active STEP_ORDER until the dedicated
  // 10-thread calibration UI lands in Phase 2b. Stamping it from this
  // route would have made the calibration flow unreachable.
  const result = await advanceOnboardingStep(supabase, auth.session.user_id, {
    step_completed: "interests",
    patch: { interests_submitted_at: new Date().toISOString() },
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
    topic_count: topics.length,
    current_step: result.state.current_step,
  });
}
