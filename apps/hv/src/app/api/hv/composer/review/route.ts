import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { reviewDraft } from "@/lib/composer/review";

/**
 * POST /api/hv/composer/review
 * Run Sentinel review on an email draft.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: {
    subject: string;
    body: string;
    contact_email?: string;
    contact_linkedin?: string;
    org_domain?: string;
  };
  try {
    const parsed = await request.json();
    if (parsed === null || typeof parsed !== "object") {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed as typeof body;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.subject || !body.body) {
    return apiError("subject and body are required", 400);
  }

  const admin = createAdminClient();

  try {
    const review = await reviewDraft(admin, {
      accountId: auth.account_id,
      subject: body.subject,
      body: body.body,
      contactEmail: body.contact_email,
      contactLinkedin: body.contact_linkedin,
      orgDomain: body.org_domain,
    });

    return apiSuccess(review);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sentinel review failed";
    return apiError(message, 500);
  }
}
