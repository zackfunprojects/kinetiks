import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { processApprovalDecision } from "@/lib/approvals/learning-loop";
import type { ApprovalRecord } from "@/lib/approvals/types";

/**
 * POST /api/approvals/batch
 * Batch approve all pending quick approvals.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  const admin = createAdminClient();

  const { data: pendingQuick, error: queryError } = await admin
    .from("kinetiks_approvals")
    .select("*")
    .eq("account_id", auth.account_id)
    .eq("status", "pending")
    .eq("approval_type", "quick");

  if (queryError) {
    return apiError("Failed to fetch quick approvals", 500);
  }

  const approvals = (pendingQuick ?? []) as ApprovalRecord[];
  const approvedIds: string[] = [];

  for (const approval of approvals) {
    try {
      await processApprovalDecision(approval, {
        approval_id: approval.id,
        action: "approve",
        edits: null,
        rejection_reason: null,
      });
      approvedIds.push(approval.id);
    } catch {
      // Skip failed individual approvals, continue batch
    }
  }

  // Log batch event to Ledger
  if (approvedIds.length > 0) {
    await admin.from("kinetiks_ledger").insert({
      account_id: auth.account_id,
      event_type: "approval_batch_approved",
      source_app: "kinetiks",
      target_layer: null,
      data: {
        approved_count: approvedIds.length,
        approval_ids: approvedIds,
      },
      attribution: "user",
    });
  }

  return apiSuccess({
    approved_count: approvedIds.length,
    approval_ids: approvedIds,
  });
}
