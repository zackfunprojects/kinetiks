import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { captureException, USER_SAFE } from "@/lib/observability/sentry";
import { embedApprovalSchema, REFERENCE_ACTION_CATEGORY } from "@/lib/embed/contract";
import { calibrateThreshold } from "@/lib/approvals/threshold";
import { analyzeEdits } from "@/lib/approvals/edit-analyzer";
import type { Json } from "@kinetiks/supabase";

/**
 * POST /api/id/embed/approval
 *
 * The in-panel visual approval (spec §9.1) for the reference surface. There is
 * no kinetiks_approvals row behind the reference surface, so this records the
 * decision as a learning signal directly: `approve` (clean), `approve_with_edits`
 * (runs the edit analyzer — the system learns from every edit), and `reject`
 * (reason → trust contraction). Calibrates the threshold and writes the matching
 * Ledger entry, fixture-labeled. Account-scoped, service-role write.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const parsed = embedApprovalSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid approval decision", 400);

  const intent = parsed.data;
  const accountId = auth.account_id;
  const admin = createAdminClient();

  try {
    if (intent.decision === "approve") {
      const threshold = await calibrateThreshold(accountId, REFERENCE_ACTION_CATEGORY, "approved_clean");
      const { error: ledgerErr } = await admin.from("kinetiks_ledger").insert({
        account_id: accountId,
        event_type: "approval_approved",
        source_app: "kinetiks_fixtures",
        target_layer: null,
        detail: { is_fixture: true, action_category: REFERENCE_ACTION_CATEGORY, in_panel: true },
        source_operator: "approval_system",
      });
      if (ledgerErr) throw ledgerErr;
      return apiSuccess({ decision: "approve", auto_approve_threshold: threshold.auto_approve_threshold });
    }

    if (intent.decision === "approve_with_edits") {
      const classifications = await analyzeEdits(intent.original, intent.edited, {
        account_id: accountId,
        id: "embed-reference",
        action_category: REFERENCE_ACTION_CATEGORY,
        source_app: "kinetiks_fixtures",
      });
      const threshold = await calibrateThreshold(
        accountId,
        REFERENCE_ACTION_CATEGORY,
        "approved_with_edits",
      );
      const { error: ledgerErr } = await admin.from("kinetiks_ledger").insert({
        account_id: accountId,
        event_type: "approval_approved_with_edits",
        source_app: "kinetiks_fixtures",
        target_layer: null,
        detail: {
          is_fixture: true,
          action_category: REFERENCE_ACTION_CATEGORY,
          in_panel: true,
          edit_classification: classifications as unknown as Json,
        },
        source_operator: "approval_system",
      });
      if (ledgerErr) throw ledgerErr;
      return apiSuccess({
        decision: "approve_with_edits",
        edit_classification: classifications,
        auto_approve_threshold: threshold.auto_approve_threshold,
      });
    }

    // reject — trust contraction.
    const threshold = await calibrateThreshold(accountId, REFERENCE_ACTION_CATEGORY, "rejected");
    const { error: ledgerErr } = await admin.from("kinetiks_ledger").insert({
      account_id: accountId,
      event_type: "approval_rejected",
      source_app: "kinetiks_fixtures",
      target_layer: null,
      detail: {
        is_fixture: true,
        action_category: REFERENCE_ACTION_CATEGORY,
        in_panel: true,
        rejection_reason: intent.reason,
      },
      source_operator: "approval_system",
    });
    if (ledgerErr) throw ledgerErr;
    return apiSuccess({ decision: "reject", auto_approve_threshold: threshold.auto_approve_threshold });
  } catch (err) {
    await captureException(err, {
      tags: { route: "/api/id/embed/approval", action: "embed.approval", stage: "persist", app: "id" },
      user: { id: accountId },
      extra: { decision: intent.decision },
    });
    return apiError(USER_SAFE.GENERIC_ERROR, 500);
  }
}
