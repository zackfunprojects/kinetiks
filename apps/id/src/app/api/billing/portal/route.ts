/**
 * POST /api/billing/portal — Stripe Customer Portal session.
 *
 * The portal owns everything post-acquisition: plan changes,
 * cancellation, payment-method updates, invoices. E1 moved this route
 * onto the shared Stripe client (lib/billing/stripe.ts) and the
 * canonical observability shape; behavior is unchanged for callers.
 */

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { captureException } from "@/lib/observability/sentry";
import { serverEnv } from "@kinetiks/lib/env";
import { createPortalSession, stripeConfigured } from "@/lib/billing/stripe";

const GENERIC_PORTAL_ERROR = "We couldn't open the billing portal. Try again.";
const PORTAL_NOT_CONFIGURED =
  "Subscriptions aren't available on this deployment yet.";
const NO_CUSTOMER =
  "No billing profile yet. Choose a plan first to set one up.";

export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "admin" });
  if (error) return error;

  if (!stripeConfigured()) {
    return apiError(PORTAL_NOT_CONFIGURED, 503);
  }

  const admin = createAdminClient();

  const { data: billing, error: billingError } = await admin
    .from("kinetiks_billing")
    .select("stripe_customer_id")
    .eq("account_id", auth.account_id)
    .maybeSingle();
  if (billingError) {
    await captureException(new Error(billingError.message), {
      tags: {
        route: "/api/billing/portal",
        action: "billing.portal",
        stage: "select",
        app: "id",
      },
      user: { id: auth.account_id },
      extra: {},
    });
    return apiError(GENERIC_PORTAL_ERROR, 500);
  }

  if (!billing?.stripe_customer_id) {
    return apiError(NO_CUSTOMER, 400);
  }

  try {
    const appUrl = serverEnv().NEXT_PUBLIC_APP_URL ?? "https://kinetiks.ai";
    const session = await createPortalSession({
      customerId: billing.stripe_customer_id,
      returnUrl: `${appUrl}/chat`,
    });
    return apiSuccess({ url: session.url });
  } catch (err) {
    await captureException(err instanceof Error ? err : new Error(String(err)), {
      tags: {
        route: "/api/billing/portal",
        action: "billing.portal",
        stage: "create_session",
        app: "id",
      },
      user: { id: auth.account_id },
      extra: {},
    });
    return apiError(GENERIC_PORTAL_ERROR, 502);
  }
}
