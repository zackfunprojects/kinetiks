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
  await advanceOnboardingStep(supabase, auth.session.user_id, {
    step_completed: "connect",
  });

  return NextResponse.json({ success: true });
}
