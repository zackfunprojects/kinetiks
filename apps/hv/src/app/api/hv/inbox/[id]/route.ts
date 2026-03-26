import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import type { ReplyClassification } from "@/types/inbox";

const VALID_CLASSIFICATIONS: ReplyClassification[] = [
  "interested",
  "not_interested",
  "bounce",
  "ooo",
  "referral",
  "unclassified",
];

interface RouteContext {
  params: { id: string };
}

/**
 * PATCH /api/hv/inbox/:id
 * Update the reply_classification of an email.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const { id } = params;

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (
    typeof body.reply_classification !== "string" ||
    !VALID_CLASSIFICATIONS.includes(body.reply_classification as ReplyClassification)
  ) {
    return apiError(
      `reply_classification must be one of: ${VALID_CLASSIFICATIONS.join(", ")}`,
      400
    );
  }

  const admin = createAdminClient();

  const { data, error: updateError } = await admin
    .from("hv_emails")
    .update({ reply_classification: body.reply_classification })
    .eq("id", id)
    .eq("kinetiks_id", auth.account_id)
    .select("*")
    .single();

  if (updateError) return apiError(updateError.message, 500);
  return apiSuccess(data);
}
