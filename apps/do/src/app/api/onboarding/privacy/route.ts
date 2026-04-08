import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { advanceOnboardingStep } from "@/lib/onboarding/state";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireDeskOfSession();
  if ("error" in auth) return auth.error;

  let body: { version?: string };
  try {
    body = (await request.json()) as { version?: string };
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  if (!body.version) {
    return NextResponse.json(
      { success: false, error: "Missing privacy disclosure version" },
      { status: 400 }
    );
  }

  const supabase = createDeskOfServerClient();
  await advanceOnboardingStep(supabase, auth.session.user_id, {
    step_completed: "privacy",
    patch: {
      privacy_acknowledged_at: new Date().toISOString(),
      privacy_disclosure_version: body.version,
    },
  });

  return NextResponse.json({ success: true });
}
