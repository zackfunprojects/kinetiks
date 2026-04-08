import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { advanceOnboardingStep } from "@/lib/onboarding/state";

export const dynamic = "force-dynamic";

/**
 * Phase 2 placeholder: lets the user continue past the connect step
 * without actually connecting Reddit. Once the Reddit OAuth client
 * lands, this route is replaced with the real OAuth callback handler.
 */
export async function POST() {
  const auth = await requireDeskOfSession();
  if ("error" in auth) return auth.error;

  const supabase = createDeskOfServerClient();
  const result = await advanceOnboardingStep(supabase, auth.session.user_id, {
    step_completed: "connect",
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

  return NextResponse.json({ success: true, current_step: result.state.current_step });
}
