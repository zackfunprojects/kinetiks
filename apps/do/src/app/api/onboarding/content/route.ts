import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { advanceOnboardingStep } from "@/lib/onboarding/state";
import { submitContentUrls } from "@/lib/mirror/cold-start";
import type { ContentUrlInput } from "@/lib/mirror/cold-start";

export const dynamic = "force-dynamic";

const ALLOWED_SOURCES = new Set([
  "blog",
  "newsletter",
  "linkedin",
  "twitter",
  "other",
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

  const rawUrls = (raw as { urls?: unknown }).urls;
  if (rawUrls !== undefined && !Array.isArray(rawUrls)) {
    return NextResponse.json(
      { success: false, error: "urls must be an array" },
      { status: 400 }
    );
  }

  const urls: ContentUrlInput[] = ((rawUrls ?? []) as unknown[]).filter(
    (u): u is ContentUrlInput =>
      typeof u === "object" &&
      u !== null &&
      typeof (u as { url?: unknown }).url === "string" &&
      typeof (u as { source?: unknown }).source === "string" &&
      ALLOWED_SOURCES.has((u as { source: string }).source)
  );

  const supabase = createDeskOfServerClient();
  let accepted = 0;
  if (urls.length > 0) {
    const result = await submitContentUrls(
      supabase,
      auth.session.user_id,
      auth.session.tier,
      urls
    );
    accepted = result.accepted;
  }

  const advance = await advanceOnboardingStep(supabase, auth.session.user_id, {
    step_completed: "content",
    patch: { content_urls_submitted_at: new Date().toISOString() },
  });

  if (!advance.ok) {
    return NextResponse.json(
      {
        success: false,
        error: "Onboarding step out of order",
        current_step: advance.current_step,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    success: true,
    accepted,
    current_step: advance.state.current_step,
  });
}
