import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { advanceOnboardingStep } from "@/lib/onboarding/state";

export const dynamic = "force-dynamic";

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

  const versionRaw = (raw as { version?: unknown }).version;
  const version =
    typeof versionRaw === "string" ? versionRaw.trim() : "";

  if (!version) {
    return NextResponse.json(
      { success: false, error: "Missing privacy disclosure version" },
      { status: 400 }
    );
  }

  const supabase = createDeskOfServerClient();
  const result = await advanceOnboardingStep(supabase, auth.session.user_id, {
    step_completed: "privacy",
    patch: {
      privacy_acknowledged_at: new Date().toISOString(),
      privacy_disclosure_version: version,
    },
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
