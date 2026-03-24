import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { reviewContent } from "@/lib/sentinel/review";
import type { ReviewRequest, SentinelContentType } from "@kinetiks/types";
import { NextResponse } from "next/server";

const VALID_CONTENT_TYPES: SentinelContentType[] = [
  "cold_email",
  "follow_up_email",
  "linkedin_connect",
  "linkedin_dm",
  "voice_call_script",
  "voicemail_script",
  "auto_reply",
  "meeting_message",
  "blog_post",
  "social_post",
  "newsletter",
  "seo_content",
  "landing_page",
  "personalized_page",
  "ab_variant",
  "press_release",
  "journalist_pitch",
  "media_response",
];

/**
 * POST /api/sentinel/review
 *
 * Submit content for Sentinel review before external delivery.
 * Returns verdict (approved/flagged/held), quality score, flags,
 * fatigue check, and compliance check results.
 *
 * Auth: user session OR Authorization: Bearer {INTERNAL_SERVICE_SECRET}
 */
export async function POST(request: Request) {
  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  const authHeader = request.headers.get("authorization");
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
  const isServiceCall =
    !!internalSecret && authHeader === `Bearer ${internalSecret}`;

  if ((authError || !user) && !isServiceCall) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ReviewRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { account_id, source_app, content_type, content } = body;

  if (!account_id || typeof account_id !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid account_id" },
      { status: 400 }
    );
  }

  if (!source_app || typeof source_app !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid source_app" },
      { status: 400 }
    );
  }

  if (!VALID_CONTENT_TYPES.includes(content_type)) {
    return NextResponse.json(
      { error: `Invalid content_type: ${content_type}` },
      { status: 400 }
    );
  }

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing or empty content" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify account ownership if user-authenticated
  if (!isServiceCall && user) {
    const { data: account } = await admin
      .from("kinetiks_accounts")
      .select("id")
      .eq("id", account_id)
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json(
        { error: "Forbidden: account does not belong to you" },
        { status: 403 }
      );
    }
  }

  try {
    const result = await reviewContent(admin, body);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Sentinel review failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
