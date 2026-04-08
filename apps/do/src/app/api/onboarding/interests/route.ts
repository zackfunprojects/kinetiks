import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { advanceOnboardingStep } from "@/lib/onboarding/state";
import { submitPersonalInterests } from "@/lib/mirror/cold-start";

export const dynamic = "force-dynamic";

const MAX_TOPICS = 25;
const MAX_TOPIC_LENGTH = 80;

interface Body {
  topics?: string[];
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

  const topics = (body.topics ?? [])
    .filter((t) => typeof t === "string")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= MAX_TOPIC_LENGTH)
    .slice(0, MAX_TOPICS);

  const supabase = createDeskOfServerClient();
  if (topics.length > 0) {
    await submitPersonalInterests(supabase, auth.session.user_id, topics);
  }

  // Calibration step is optional in Phase 2 — we mark it complete here
  // alongside interests so the flow can proceed to track selection.
  // Phase 2b will surface the 10 calibration threads inline.
  await advanceOnboardingStep(supabase, auth.session.user_id, {
    step_completed: "calibration",
    patch: { calibration_completed_at: new Date().toISOString() },
  });
  await advanceOnboardingStep(supabase, auth.session.user_id, {
    step_completed: "interests",
    patch: { interests_submitted_at: new Date().toISOString() },
  });

  return NextResponse.json({ success: true, topic_count: topics.length });
}
