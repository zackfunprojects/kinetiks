/**
 * POST /api/billing/webhook — Phase E1.
 *
 * The Stripe webhook endpoint for subscription lifecycle. Receives
 * `checkout.session.completed`, `customer.subscription.*`, and
 * `invoice.*` events; every billing-state write flows through
 * lib/billing/sync.ts against a FRESHLY FETCHED subscription, so
 * out-of-order delivery cannot regress the row.
 *
 * Contract rules (mirrors the Slack events receiver):
 *   - raw body read BEFORE parsing; signature verified with
 *     timing-safe compare and a 5-minute replay window both directions
 *   - missing secret is a configuration error: 500 + Sentry, never a
 *     silent pass-through
 *   - exactly-once per event id via a kinetiks_inbound_events claim
 *     (source 'stripe'); the duplicate retry loses with 23505 → 200
 *   - processing failure RELEASES the claim and returns 500 so
 *     Stripe's retry can re-attempt (claims are not tombstones for
 *     work that never happened)
 *   - events for customers we don't know (other environments sharing
 *     the Stripe account) ack 200 and are skipped
 */

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { captureException } from "@/lib/observability/sentry";
import { serverEnv } from "@kinetiks/lib/env";
import { verifyStripeSignature, fetchSubscription } from "@/lib/billing/stripe";
import {
  syncSubscriptionToBilling,
  type BillingRowSnapshot,
} from "@/lib/billing/sync";
import { PLAN_DETAILS } from "@/lib/billing/plans";
import type { BillingPlan } from "@kinetiks/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PG_UNIQUE_VIOLATION = "23505";

const eventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.object({ object: z.record(z.unknown()) }),
});

/** The event types this endpoint acts on; everything else acks 200. */
const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

export async function POST(request: Request) {
  const secret = serverEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    await captureException(
      new Error("STRIPE_WEBHOOK_SECRET is not set but the webhook was called"),
      {
        tags: {
          route: "/api/billing/webhook",
          action: "billing.webhook",
          stage: "configuration",
          app: "id",
        },
        extra: {},
      },
    );
    return Response.json({ error: "not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const verification = verifyStripeSignature(
    rawBody,
    request.headers.get("stripe-signature"),
    secret,
  );
  if (!verification.ok) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }
  const parsed = eventSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }
  const event = parsed.data;

  if (!HANDLED_EVENTS.has(event.type)) {
    return Response.json({ ok: true, ignored: true });
  }

  const admin = createAdminClient();
  const object = event.data.object;

  // ── Resolve the account this event belongs to ──
  const billing = await resolveBillingRow(event.type, object);
  if (!billing) {
    // A customer we don't know — normal when several environments
    // share one Stripe account. Verified-but-unroutable acks 200.
    return Response.json({ ok: true, skipped: "unknown_customer" });
  }

  // ── Exactly-once claim ──
  const eventKey = `stripe:${event.id}`;
  const { error: claimError } = await admin.from("kinetiks_inbound_events").insert({
    account_id: billing.account_id,
    source: "stripe",
    event_key: eventKey,
    event_type: event.type,
  });
  if (claimError) {
    if (claimError.code === PG_UNIQUE_VIOLATION) {
      return Response.json({ ok: true, duplicate: true });
    }
    await captureException(new Error(claimError.message), {
      tags: {
        route: "/api/billing/webhook",
        action: "billing.webhook",
        stage: "claim",
        app: "id",
      },
      user: { id: billing.account_id },
      extra: { eventType: event.type },
    });
    return Response.json({ error: "claim failed" }, { status: 500 });
  }

  try {
    await processEvent(event.type, object, billing);
    return Response.json({ ok: true });
  } catch (err) {
    // Release the claim so Stripe's retry re-attempts the work.
    await admin
      .from("kinetiks_inbound_events")
      .delete()
      .eq("event_key", eventKey)
      .then(({ error: releaseError }) => {
        if (releaseError) {
          // Claim stuck without processed work — surfaced loudly; the
          // event will need a manual replay from the Stripe dashboard.
          return captureException(new Error(releaseError.message), {
            tags: {
              route: "/api/billing/webhook",
              action: "billing.webhook",
              stage: "claim_release",
              app: "id",
            },
            user: { id: billing.account_id },
            extra: { eventType: event.type },
          });
        }
        return undefined;
      });
    await captureException(err instanceof Error ? err : new Error(String(err)), {
      tags: {
        route: "/api/billing/webhook",
        action: "billing.webhook",
        stage: event.type,
        app: "id",
      },
      user: { id: billing.account_id },
      extra: { eventType: event.type },
    });
    return Response.json({ error: "processing failed" }, { status: 500 });
  }
}

/**
 * Find the kinetiks_billing row an event addresses. Checkout sessions
 * carry our account id directly (client_reference_id); subscription
 * and invoice objects resolve through stripe_customer_id.
 */
async function resolveBillingRow(
  eventType: string,
  object: Record<string, unknown>,
): Promise<BillingRowSnapshot | null> {
  const admin = createAdminClient();
  const select = "account_id, plan, plan_status, stripe_customer_id, stripe_subscription_id";

  if (eventType === "checkout.session.completed") {
    const accountId =
      typeof object.client_reference_id === "string" ? object.client_reference_id : null;
    if (accountId) {
      const { data, error } = await admin
        .from("kinetiks_billing")
        .select(select)
        .eq("account_id", accountId)
        .maybeSingle();
      if (error) throw new Error(`billing lookup failed: ${error.message}`);
      if (data) return data as BillingRowSnapshot;
    }
  }

  const customerId = typeof object.customer === "string" ? object.customer : null;
  if (!customerId) return null;
  const { data, error } = await admin
    .from("kinetiks_billing")
    .select(select)
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error(`billing lookup failed: ${error.message}`);
  return (data as BillingRowSnapshot | null) ?? null;
}

async function processEvent(
  eventType: string,
  object: Record<string, unknown>,
  billing: BillingRowSnapshot,
): Promise<void> {
  const admin = createAdminClient();

  switch (eventType) {
    case "checkout.session.completed": {
      // Only subscription-mode sessions carry a subscription id.
      const subscriptionId =
        typeof object.subscription === "string" ? object.subscription : null;
      if (!subscriptionId) return;
      const subscription = await fetchSubscription(subscriptionId);
      await syncSubscriptionToBilling(billing, subscription);
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscriptionId = typeof object.id === "string" ? object.id : null;
      if (!subscriptionId) return;
      // Re-fetch rather than trusting the (possibly stale) event copy.
      // Deleted subscriptions stay retrievable with status=canceled.
      const subscription = await fetchSubscription(subscriptionId);
      // Ignore events for a subscription that isn't (or never became)
      // the row's live subscription AND isn't introducing one — guards
      // against a brand-new subscription being clobbered by the tail
      // of an old one's event stream.
      if (
        billing.stripe_subscription_id &&
        billing.stripe_subscription_id !== subscription.id &&
        subscription.status === "canceled"
      ) {
        return;
      }
      await syncSubscriptionToBilling(billing, subscription);
      return;
    }

    case "invoice.paid": {
      // Renewal: reset the seeds quota for the new period and clear
      // any past_due flag. Activation seeds are handled by the
      // subscription sync; only cycle renewals act here.
      if (object.billing_reason !== "subscription_cycle") return;
      const quota = PLAN_DETAILS[billing.plan as BillingPlan]?.seedsPerMonth;
      if (quota === undefined) return;
      const { error } = await admin
        .from("kinetiks_billing")
        .update({
          seeds_balance: quota,
          plan_status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("account_id", billing.account_id);
      if (error) throw new Error(`renewal update failed: ${error.message}`);
      return;
    }

    case "invoice.payment_failed": {
      const { error } = await admin
        .from("kinetiks_billing")
        .update({ plan_status: "past_due", updated_at: new Date().toISOString() })
        .eq("account_id", billing.account_id);
      if (error) throw new Error(`past_due update failed: ${error.message}`);
      const attemptCount =
        typeof object.attempt_count === "number" ? object.attempt_count : null;
      const { error: ledgerError } = await admin.from("kinetiks_ledger").insert({
        account_id: billing.account_id,
        event_type: "billing_payment_failed",
        source_app: "kinetiks_id",
        source_operator: "stripe_webhook",
        detail: {
          plan: billing.plan,
          stripe_subscription_id: billing.stripe_subscription_id,
          attempt_count: attemptCount,
        },
      });
      if (ledgerError) {
        // Audit gap, not state bug — loud, not thrown (a throw would
        // release the claim and re-apply past_due on retry, fine, but
        // would also re-Sentry forever on a persistent ledger issue).
        await captureException(new Error(ledgerError.message), {
          tags: {
            route: "/api/billing/webhook",
            action: "billing.ledger",
            stage: "billing_payment_failed",
            app: "id",
          },
          user: { id: billing.account_id },
          extra: {},
        });
      }
      return;
    }
  }
}
