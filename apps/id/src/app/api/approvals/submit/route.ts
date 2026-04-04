import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { processApproval } from "@/lib/approvals/pipeline";
import type { ApprovalSubmission } from "@/lib/approvals/types";

/**
 * POST /api/approvals/submit
 * Synapse submits work for approval through the pipeline.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: ApprovalSubmission;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.source_app || !body.action_category || !body.title || !body.preview) {
    return apiError("Missing required fields: source_app, action_category, title, preview", 400);
  }

  try {
    const result = await processApproval(body, auth.account_id);
    return apiSuccess(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline error";
    return apiError(message, 500);
  }
}
