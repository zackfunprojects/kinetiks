import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { captureException } from "@/lib/observability/sentry";
import { purchasablePlans, stripeConfigured } from "@/lib/billing/stripe";

const GENERIC_BILLING_LOAD_ERROR = "We couldn't load your billing details. Try again.";

/**
 * GET /api/billing
 *
 * C2 — the SettingsModal billing section reads the account's
 * kinetiks_billing row here (the legacy (dashboard)/billing page loaded
 * it server-side; the modal is a client surface). Returns null when no
 * row exists yet (a fresh account before billing init), which the UI
 * renders as the free plan.
 *
 * E1 — also reports the deployment's Stripe configuration so the
 * plan-picker can render an honest "not configured" state (the D1
 * connections-card precedent) instead of permanently disabled buttons.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const { data: billing, error: billingError } = await admin
    .from("kinetiks_billing")
    .select("*")
    .eq("account_id", auth.account_id)
    .maybeSingle();

  if (billingError) {
    await captureException(new Error(billingError.message), {
      tags: { route: "/api/billing", action: "billing.load", stage: "select", app: "id" },
      user: { id: auth.account_id },
      extra: {},
    });
    return apiError(GENERIC_BILLING_LOAD_ERROR, 500);
  }

  return apiSuccess({
    billing: billing ?? null,
    config: {
      portal: stripeConfigured(),
      purchasable: purchasablePlans(),
    },
  });
}
