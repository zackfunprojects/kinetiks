import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import { reviewContent } from "@/lib/sentinel/review";
import type { ReviewRequest, SentinelContentType } from "@kinetiks/types";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

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
 * Auth: user session, API key, or internal service secret
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: ReviewRequest;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const { account_id, source_app, content_type, content } = body;

  if (!account_id || typeof account_id !== "string") {
    return apiError("Missing or invalid account_id", 400);
  }

  if (!source_app || typeof source_app !== "string") {
    return apiError("Missing or invalid source_app", 400);
  }

  if (!VALID_CONTENT_TYPES.includes(content_type)) {
    return apiError(`Invalid content_type: ${content_type}`, 400);
  }

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return apiError("Missing or empty content", 400);
  }

  // Validate optional string fields
  const optionalStringFields = [
    "source_operator",
    "contact_email",
    "contact_linkedin",
    "org_domain",
  ] as const;

  for (const field of optionalStringFields) {
    const value = body[field];
    if (value !== undefined && (typeof value !== "string" || value.length === 0)) {
      return apiError(`Invalid ${field}: must be a non-empty string or omitted`, 400);
    }
  }

  // Validate optional metadata field
  if (
    body.metadata !== undefined &&
    (typeof body.metadata !== "object" ||
      body.metadata === null ||
      Array.isArray(body.metadata))
  ) {
    return apiError("Invalid metadata: must be an object or omitted", 400);
  }

  const admin = createAdminClient();

  // Verify account ownership if not internal
  if (auth.auth_method !== "internal") {
    const { data: account } = await admin
      .from("kinetiks_accounts")
      .select("id")
      .eq("id", account_id)
      .eq("user_id", auth.user_id)
      .single();

    if (!account) {
      return apiError("Forbidden: account does not belong to you", 403);
    }
  }

  try {
    const result = await reviewContent(admin, body);
    return apiSuccess(result);
  } catch (err) {
    console.error("Sentinel review failed:", err);
    return apiError("Internal server error", 500);
  }
}
