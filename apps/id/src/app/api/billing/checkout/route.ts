/**
 * POST /api/billing/checkout — Phase E1.
 *
 * Starts a Stripe Checkout Session for a paid plan. This is the
 * free→paid acquisition path; plan CHANGES on an existing subscription
 * go through the Billing Portal (POST /api/billing/portal), which is
 * where proration and cancellation live.
 *
 * Flow: validate plan → get-or-create the billing row → get-or-create
 * the Stripe customer (the first write of `stripe_customer_id` in the
 * product's history) → create the session → return its URL for the
 * client redirect. The webhook (/api/billing/webhook) lands the
 * resulting subscription on the row; nothing here assumes success.
 */

import { z } from "zod";

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { captureException } from "@/lib/observability/sentry";
import { serverEnv } from "@kinetiks/lib/env";
import {
  createCheckoutSession,
  createCustomer,
  isPaidPlan,
  priceIdForPlan,
  stripeConfigured,
} from "@/lib/billing/stripe";

const GENERIC_CHECKOUT_ERROR = "We couldn't start checkout. Try again.";
const CHECKOUT_NOT_CONFIGURED =
  "Subscriptions aren't available on this deployment yet.";
const ALREADY_SUBSCRIBED =
  "You already have an active subscription. Use Manage Subscription to change plans.";

const bodySchema = z.object({
  plan: z.enum(["starter", "pro", "team"]),
});

export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "admin" });
  if (error) return error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("Invalid plan", 400);
  }
  const plan = parsed.data.plan;
  if (!isPaidPlan(plan)) return apiError("Invalid plan", 400);

  const priceId = priceIdForPlan(plan);
  if (!stripeConfigured() || !priceId) {
    return apiError(CHECKOUT_NOT_CONFIGURED, 503);
  }

  const admin = createAdminClient();

  try {
    // Get-or-create the billing row (fresh accounts have none).
    const { data: existing, error: readError } = await admin
      .from("kinetiks_billing")
      .select("id, plan, plan_status, stripe_customer_id, stripe_subscription_id")
      .eq("account_id", auth.account_id)
      .maybeSingle();
    if (readError) throw new Error(`billing read failed: ${readError.message}`);

    let billing = existing;
    if (!billing) {
      const { data: created, error: insertError } = await admin
        .from("kinetiks_billing")
        .upsert(
          { account_id: auth.account_id },
          { onConflict: "account_id", ignoreDuplicates: false },
        )
        .select("id, plan, plan_status, stripe_customer_id, stripe_subscription_id")
        .single();
      if (insertError || !created) {
        throw new Error(`billing init failed: ${insertError?.message ?? "no row"}`);
      }
      billing = created;
    }

    // A live subscription means plan changes belong to the portal —
    // a second Checkout would mint a second subscription.
    if (billing.stripe_subscription_id && billing.plan_status !== "canceled") {
      return apiError(ALREADY_SUBSCRIBED, 409);
    }

    // Get-or-create the Stripe customer.
    let customerId = billing.stripe_customer_id;
    if (!customerId) {
      const email = await resolveOwnerEmail(auth.account_id);
      const customer = await createCustomer({
        accountId: auth.account_id,
        email,
      });
      customerId = customer.id;
      const { error: writeError } = await admin
        .from("kinetiks_billing")
        .update({
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        })
        .eq("account_id", auth.account_id);
      if (writeError) {
        throw new Error(`stripe_customer_id write failed: ${writeError.message}`);
      }
    }

    const appUrl = serverEnv().NEXT_PUBLIC_APP_URL ?? "https://kinetiks.ai";
    const session = await createCheckoutSession({
      customerId,
      priceId,
      accountId: auth.account_id,
      successUrl: `${appUrl}/chat?checkout=success`,
      cancelUrl: `${appUrl}/chat?checkout=cancelled`,
    });
    if (!session.url) {
      throw new Error("checkout session created without a redirect URL");
    }

    return apiSuccess({ url: session.url });
  } catch (err) {
    await captureException(err instanceof Error ? err : new Error(String(err)), {
      tags: {
        route: "/api/billing/checkout",
        action: "billing.checkout",
        stage: "create_session",
        app: "id",
      },
      user: { id: auth.account_id },
      extra: { plan },
    });
    return apiError(GENERIC_CHECKOUT_ERROR, 500);
  }
}

/**
 * The account owner's login email, for Stripe customer creation. Same
 * resolution path as the system-email recipient policy (account →
 * user_id → auth user), local here so billing failures carry billing
 * context rather than tool-shaped errors.
 */
async function resolveOwnerEmail(accountId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: account, error } = await admin
    .from("kinetiks_accounts")
    .select("user_id")
    .eq("id", accountId)
    .maybeSingle();
  if (error || !account?.user_id) {
    throw new Error(`account owner lookup failed: ${error?.message ?? "no account"}`);
  }
  const { data: userResult, error: userError } = await admin.auth.admin.getUserById(
    account.user_id as string,
  );
  if (userError || !userResult?.user?.email) {
    throw new Error(
      `owner email lookup failed: ${userError?.message ?? "no email on auth user"}`,
    );
  }
  return userResult.user.email.toLowerCase();
}
