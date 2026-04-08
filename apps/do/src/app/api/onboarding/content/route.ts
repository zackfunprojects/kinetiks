import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { advanceOnboardingStep } from "@/lib/onboarding/state";
import { submitContentUrls } from "@/lib/mirror/cold-start";
import type { ContentUrlInput } from "@/lib/mirror/cold-start";

export const dynamic = "force-dynamic";

interface Body {
  urls?: ContentUrlInput[];
}

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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const urls = (body.urls ?? []).filter(
    (u) =>
      typeof u?.url === "string" &&
      typeof u?.source === "string" &&
      ALLOWED_SOURCES.has(u.source)
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

  await advanceOnboardingStep(supabase, auth.session.user_id, {
    step_completed: "content",
    patch: { content_urls_submitted_at: new Date().toISOString() },
  });

  return NextResponse.json({ success: true, accepted });
}
