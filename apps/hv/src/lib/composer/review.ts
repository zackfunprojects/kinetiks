/**
 * Sentinel review wrapper for email drafts.
 */

import { reviewContent } from "@kinetiks/sentinel";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReviewResponse } from "@kinetiks/types";

interface ReviewDraftParams {
  accountId: string;
  subject: string;
  body: string;
  contactEmail?: string;
  contactLinkedin?: string;
  orgDomain?: string;
}

/**
 * Run a Sentinel review on an email draft.
 * Checks editorial quality, compliance, brand safety, and contact fatigue.
 */
export async function reviewDraft(
  admin: SupabaseClient,
  params: ReviewDraftParams
): Promise<ReviewResponse> {
  const content = `Subject: ${params.subject}\n\n${params.body}`;

  return reviewContent(admin, {
    account_id: params.accountId,
    source_app: "harvest",
    source_operator: "composer",
    content_type: "cold_email",
    content,
    contact_email: params.contactEmail,
    contact_linkedin: params.contactLinkedin,
    org_domain: params.orgDomain,
  });
}
