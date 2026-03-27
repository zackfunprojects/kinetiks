import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { sendHarvestEmail } from "@/lib/email/send";

/**
 * POST /api/hv/emails/[id]/send
 * Send a draft email. Validates ownership, suppression, mailbox limits, and Sentinel verdict.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const result = await sendHarvestEmail(params.id, auth.account_id);

  if (!result.success) {
    return apiError(result.error ?? "Send failed", 400);
  }

  return apiSuccess({
    sent: true,
    message_id: result.messageId,
    provider: result.provider,
  });
}
