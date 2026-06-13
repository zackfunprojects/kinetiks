/**
 * Stripe subscription → kinetiks_billing sync — Phase E1.
 *
 * The single writer for billing state. Called by the webhook route
 * with a FRESHLY FETCHED subscription (never the event payload's
 * embedded copy) so out-of-order webhook delivery cannot regress the
 * row: whatever order events arrive in, the write reflects Stripe's
 * current truth at processing time.
 *
 * Responsibilities:
 *   - map Stripe price → BillingPlan and Stripe status → BillingPlanStatus
 *   - persist plan / status / period end / subscription id / card last4
 *   - reset the seeds balance on plan activation, plan change, renewal,
 *     and cancellation (quota = PLAN_DETAILS[plan].seedsPerMonth)
 *   - write the billing_* Learning Ledger events on real transitions
 *     (started / plan changed / canceled) — append-only, PII-free
 *
 * A subscription whose price maps to no configured plan is a
 * configuration drift (price ids changed in Stripe but not in env):
 * the sync keeps the previous plan, reports to Sentry, and still
 * updates lifecycle fields so the customer's status stays honest.
 */

import "server-only";

import type { BillingPlan, LedgerEventDetailMap } from "@kinetiks/types";

import { createAdminClient } from "@/lib/supabase/admin";
import { captureException } from "@/lib/observability/sentry";
import { PLAN_DETAILS } from "@/lib/billing/plans";
import {
  fetchPaymentMethod,
  planForPriceId,
  planStatusFromStripe,
  type StripeSubscription,
} from "@/lib/billing/stripe";

export interface BillingRowSnapshot {
  account_id: string;
  plan: BillingPlan;
  plan_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export interface SyncResult {
  plan: BillingPlan;
  plan_status: string;
  events_written: Array<keyof LedgerEventDetailMap>;
}

type BillingLedgerEvent =
  | "billing_subscription_started"
  | "billing_plan_changed"
  | "billing_subscription_canceled";

/**
 * Apply a live subscription's state onto the account's billing row.
 * `current` is the row as read by the caller (inside the same webhook
 * processing pass), used to detect transitions for ledger events.
 */
export async function syncSubscriptionToBilling(
  current: BillingRowSnapshot,
  subscription: StripeSubscription,
): Promise<SyncResult> {
  const admin = createAdminClient();
  const status = planStatusFromStripe(subscription.status);
  const subscriptionEnded = status === "canceled";

  // Resolve the target plan from the subscription's price.
  let plan: BillingPlan;
  if (subscriptionEnded) {
    plan = "free";
  } else {
    const priceId = subscription.items.data[0]?.price.id ?? null;
    const mapped = priceId ? planForPriceId(priceId) : null;
    if (mapped) {
      plan = mapped;
    } else {
      // Configuration drift: a live subscription on a price we don't
      // recognize. Keep the previous plan rather than silently
      // downgrading a paying customer; surface the drift to Sentry.
      plan = current.plan;
      await captureException(
        new Error(`Stripe price ${priceId ?? "(none)"} maps to no configured plan`),
        {
          tags: {
            route: "lib/billing/sync",
            action: "billing.sync",
            stage: "price_mapping",
            app: "id",
          },
          user: { id: current.account_id },
          extra: { stripeSubscriptionId: subscription.id },
        },
      );
    }
  }

  // Card last4 — best-effort display data; never blocks the sync.
  let paymentMethodLast4: string | null | undefined;
  if (subscription.default_payment_method) {
    try {
      const pm = await fetchPaymentMethod(subscription.default_payment_method);
      paymentMethodLast4 = pm.card?.last4 ?? null;
    } catch {
      paymentMethodLast4 = undefined; // leave the stored value untouched
    }
  } else if (subscriptionEnded) {
    paymentMethodLast4 = null;
  }

  const update: Record<string, unknown> = {
    plan,
    plan_status: subscriptionEnded ? "canceled" : status,
    stripe_subscription_id: subscriptionEnded ? null : subscription.id,
    current_period_end:
      !subscriptionEnded && subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
    updated_at: new Date().toISOString(),
  };
  if (paymentMethodLast4 !== undefined) {
    update.payment_method_last4 = paymentMethodLast4;
  }

  // Seeds: reset to the landing plan's quota on any plan transition or
  // on first attach of this subscription (activation). Renewal resets
  // are handled by the invoice.paid branch in the webhook route.
  const planChanged = plan !== current.plan;
  const subscriptionAttached =
    !subscriptionEnded && current.stripe_subscription_id !== subscription.id;
  if (planChanged || subscriptionAttached) {
    update.seeds_balance = PLAN_DETAILS[plan].seedsPerMonth;
  }

  const { error: updateError } = await admin
    .from("kinetiks_billing")
    .update(update)
    .eq("account_id", current.account_id);
  if (updateError) {
    throw new Error(`billing row update failed: ${updateError.message}`);
  }

  // Ledger events on real transitions only.
  const events: BillingLedgerEvent[] = [];
  if (subscriptionEnded) {
    if (current.plan !== "free" || current.stripe_subscription_id !== null) {
      events.push("billing_subscription_canceled");
    }
  } else if (current.plan === "free" || current.stripe_subscription_id === null) {
    events.push("billing_subscription_started");
  } else if (planChanged) {
    events.push("billing_plan_changed");
  }

  for (const event_type of events) {
    const detail: Record<string, unknown> =
      event_type === "billing_subscription_started"
        ? { plan, stripe_subscription_id: subscription.id }
        : event_type === "billing_plan_changed"
          ? { previous_plan: current.plan, plan, stripe_subscription_id: subscription.id }
          : { previous_plan: current.plan, stripe_subscription_id: subscription.id };
    const { error: ledgerError } = await admin.from("kinetiks_ledger").insert({
      account_id: current.account_id,
      event_type,
      source_app: "kinetiks_id",
      source_operator: "stripe_webhook",
      detail,
    });
    if (ledgerError) {
      // The billing row is already correct; a ledger miss is an audit
      // gap, not a customer-state bug. Loud to Sentry, never thrown —
      // throwing would make Stripe retry and double-apply transitions.
      await captureException(new Error(ledgerError.message), {
        tags: {
          route: "lib/billing/sync",
          action: "billing.ledger",
          stage: event_type,
          app: "id",
        },
        user: { id: current.account_id },
        extra: { stripeSubscriptionId: subscription.id },
      });
    }
  }

  return {
    plan,
    plan_status: subscriptionEnded ? "canceled" : status,
    events_written: events,
  };
}
