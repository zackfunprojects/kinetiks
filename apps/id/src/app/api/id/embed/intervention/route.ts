import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { captureException, USER_SAFE } from "@/lib/observability/sentry";
import { interventionSchema, REFERENCE_ACTION_CATEGORY } from "@/lib/embed/contract";
import { applyInterventionSignal } from "@/lib/approvals/intervention-signals";

/**
 * POST /api/id/embed/intervention
 *
 * Implicit intervention trust signal (spec §9.3). The user grabbing a field the
 * system was about to fill is a field-level confidence penalty (`grab`). It
 * persists through the same registry-driven path as kill/undo. Account-scoped,
 * fixture-labeled. (Undo is fired from the workspace-actions route directly.)
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

  const parsed = interventionSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid intervention signal", 400);

  const { component_id, field_name } = parsed.data;
  const accountId = auth.account_id;

  try {
    await applyInterventionSignal(accountId, REFERENCE_ACTION_CATEGORY, "grab", {
      extra: { component_id, field_name: field_name ?? null },
    });
    return apiSuccess({ accepted: true, signal: "grab" });
  } catch (err) {
    await captureException(err, {
      tags: { route: "/api/id/embed/intervention", action: "embed.intervention", stage: "persist", app: "id" },
      user: { id: accountId },
      extra: { signal: "grab", componentId: component_id },
    });
    return apiError(USER_SAFE.GENERIC_ERROR, 500);
  }
}
