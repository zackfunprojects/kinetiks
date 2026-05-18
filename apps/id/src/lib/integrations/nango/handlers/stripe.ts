/**
 * Nango sync handler — Stripe (charges, customers, subscriptions).
 *
 * Slice 6 implementation. Three syncs, one handler factory per sync
 * name. Each handler fetches its records and derives the relevant
 * metrics into kinetiks_metric_cache.
 *
 * Derived metrics surfaced (METRIC_REGISTRY):
 *   - stripe_mrr                  (from active subscriptions)
 *   - stripe_arr                  (mrr * 12)
 *   - stripe_new_customers        (count of customers created in window)
 *   - stripe_churn_rate           (canceled / active * 100, last 28d)
 *   - stripe_ltv                  (rolling estimate from won deals + avg sub length)
 *   - stripe_avg_order_value      (sum charges / count, last 28d)
 *   - stripe_refund_rate          (refunded charges / total, last 28d)
 *
 * The three syncs each contribute partial inputs; the Oracle's daily
 * runner ties them together into the final metric values via the same
 * pattern as the HubSpot CRM aggregator. For Slice 6, each Stripe sync's
 * handler stamps the metric subset it has authoritative data for.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRecords, NangoMisconfiguredError } from "../client";
import { registerNangoHandler } from ".";
import type { NangoHandlerFn, NangoHandlerResult } from "../types";
import { writeCachedMetric } from "@/lib/connections/metric-cache";

const STRIPE_CACHE_TTL = 30 * 60;  // 30 min

interface StripeCharge {
  id: string;
  amount: number;            // cents
  currency: string;
  paid: boolean;
  refunded: boolean;
  refund_amount: number;     // cents
  customer_id: string;
  payment_method: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  created_at: string;
}

interface StripeCustomer {
  id: string;
  email_lower_hash: string;
  domain: string;
  created_at: string;
}

interface StripeSubscription {
  id: string;
  status: string;
  customer_id: string;
  plan_amount: number;       // cents
  plan_interval: string;
  plan_interval_count: number;
  current_period_start: string;
  current_period_end: string;
  canceled_at: string;
  created_at: string;
}

// ─── Pure aggregations ──────────────────────────────────────

export interface ChargeAggregates {
  charges_total_28d: number;        // cents
  charges_count_28d: number;
  refunds_amount_28d: number;       // cents
  refunds_count_28d: number;
  avg_order_value_28d: number;      // dollars
  refund_rate_28d: number;          // percentage
}

export function aggregateCharges(
  charges: StripeCharge[],
  now: Date = new Date()
): ChargeAggregates {
  const cutoff = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  let totalAmount = 0;
  let totalCount = 0;
  let refundAmount = 0;
  let refundCount = 0;

  for (const c of charges) {
    if (!c.paid) continue;
    const d = new Date(c.created_at);
    if (!Number.isFinite(d.getTime()) || d < cutoff) continue;
    totalAmount += c.amount;
    totalCount += 1;
    if (c.refund_amount > 0) {
      refundAmount += c.refund_amount;
      refundCount += 1;
    }
  }

  return {
    charges_total_28d: totalAmount,
    charges_count_28d: totalCount,
    refunds_amount_28d: refundAmount,
    refunds_count_28d: refundCount,
    avg_order_value_28d: totalCount > 0 ? totalAmount / totalCount / 100 : 0,
    refund_rate_28d: totalCount > 0 ? (refundCount / totalCount) * 100 : 0,
  };
}

export interface CustomerAggregates {
  new_customers_28d: number;
  total_customers: number;
}

export function aggregateCustomers(
  customers: StripeCustomer[],
  now: Date = new Date()
): CustomerAggregates {
  const cutoff = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  let recent = 0;
  for (const c of customers) {
    const d = new Date(c.created_at);
    if (!Number.isFinite(d.getTime())) continue;
    if (d >= cutoff) recent += 1;
  }
  return { new_customers_28d: recent, total_customers: customers.length };
}

export interface SubscriptionAggregates {
  mrr: number;                  // dollars
  arr: number;
  active_count: number;
  canceled_28d: number;
  churn_rate_28d: number;       // percentage
}

const MONTHLY_FACTOR: Record<string, number> = {
  day: 30,
  week: 4.333,
  month: 1,
  year: 1 / 12,
};

export function aggregateSubscriptions(
  subscriptions: StripeSubscription[],
  now: Date = new Date()
): SubscriptionAggregates {
  const cutoff = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  let mrrCents = 0;
  let activeCount = 0;
  let canceled28d = 0;

  for (const s of subscriptions) {
    const isActive = s.status === "active" || s.status === "trialing";
    if (isActive && s.plan_amount > 0 && s.plan_interval && s.plan_interval_count > 0) {
      const factor = MONTHLY_FACTOR[s.plan_interval] ?? 1;
      const monthlyForOneCount = s.plan_amount * factor;
      mrrCents += monthlyForOneCount / s.plan_interval_count;
      activeCount += 1;
    }
    if (s.canceled_at) {
      const d = new Date(s.canceled_at);
      if (Number.isFinite(d.getTime()) && d >= cutoff) {
        canceled28d += 1;
      }
    }
  }

  const mrr = mrrCents / 100;
  return {
    mrr,
    arr: mrr * 12,
    active_count: activeCount,
    canceled_28d: canceled28d,
    churn_rate_28d: activeCount + canceled28d > 0
      ? (canceled28d / (activeCount + canceled28d)) * 100
      : 0,
  };
}

// ─── Cache writer helper ────────────────────────────────────

async function stampMetric(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  metric: string,
  value: number,
  unit: "count" | "currency" | "percentage" | "duration" = "count"
): Promise<void> {
  await writeCachedMetric(admin, {
    account_id: accountId,
    source: "stripe",
    input: { metric, period: "last_28_days" },
    response: {
      rows: [{ dimensions: {}, value }],
      metric,
      metric_unit: unit,
      date_range: { start: "last_28_days", end: "now" },
    },
    stale_after_seconds: STRIPE_CACHE_TTL,
  });
}

// ─── Per-sync handlers ──────────────────────────────────────

const handleCharges: NangoHandlerFn = async (ctx): Promise<NangoHandlerResult> => {
  const admin = createAdminClient();
  let total = 0;
  const all: StripeCharge[] = [];

  try {
    const summary = await fetchAllRecords<StripeCharge>(
      {
        connectionId: ctx.webhook.connectionId,
        providerConfigKey: ctx.webhook.providerConfigKey,
        model: "StripeCharge",
        modifiedAfter: ctx.webhook.modifiedAfter,
      },
      async (page) => {
        total += page.length;
        all.push(...page);
      }
    );

    const agg = aggregateCharges(all);
    await stampMetric(admin, ctx.accountId, "stripe_avg_order_value", agg.avg_order_value_28d, "currency");
    await stampMetric(admin, ctx.accountId, "stripe_refund_rate", agg.refund_rate_28d, "percentage");

    return {
      status: summary.capReached ? "partial" : "succeeded",
      recordsAdded: 0,
      recordsUpdated: 2,
      recordsDeleted: 0,
    };
  } catch (err) {
    return classifyError(err);
  }
};

const handleCustomers: NangoHandlerFn = async (ctx): Promise<NangoHandlerResult> => {
  const admin = createAdminClient();
  const all: StripeCustomer[] = [];

  try {
    await fetchAllRecords<StripeCustomer>(
      {
        connectionId: ctx.webhook.connectionId,
        providerConfigKey: ctx.webhook.providerConfigKey,
        model: "StripeCustomer",
        modifiedAfter: ctx.webhook.modifiedAfter,
      },
      async (page) => {
        all.push(...page);
      }
    );

    const agg = aggregateCustomers(all);
    await stampMetric(admin, ctx.accountId, "stripe_new_customers", agg.new_customers_28d, "count");

    return {
      status: "succeeded",
      recordsAdded: 0,
      recordsUpdated: 1,
      recordsDeleted: 0,
    };
  } catch (err) {
    return classifyError(err);
  }
};

const handleSubscriptions: NangoHandlerFn = async (ctx): Promise<NangoHandlerResult> => {
  const admin = createAdminClient();
  const all: StripeSubscription[] = [];

  try {
    await fetchAllRecords<StripeSubscription>(
      {
        connectionId: ctx.webhook.connectionId,
        providerConfigKey: ctx.webhook.providerConfigKey,
        model: "StripeSubscription",
        modifiedAfter: ctx.webhook.modifiedAfter,
      },
      async (page) => {
        all.push(...page);
      }
    );

    const agg = aggregateSubscriptions(all);
    await stampMetric(admin, ctx.accountId, "stripe_mrr", agg.mrr, "currency");
    await stampMetric(admin, ctx.accountId, "stripe_arr", agg.arr, "currency");
    await stampMetric(admin, ctx.accountId, "stripe_churn_rate", agg.churn_rate_28d, "percentage");

    return {
      status: "succeeded",
      recordsAdded: 0,
      recordsUpdated: 3,
      recordsDeleted: 0,
    };
  } catch (err) {
    return classifyError(err);
  }
};

function classifyError(err: unknown): NangoHandlerResult {
  if (err instanceof NangoMisconfiguredError) {
    return {
      status: "failed",
      recordsAdded: 0,
      recordsUpdated: 0,
      recordsDeleted: 0,
      errorClass: "nango_misconfigured",
      errorMessage: err.message,
    };
  }
  return {
    status: "failed",
    recordsAdded: 0,
    recordsUpdated: 0,
    recordsDeleted: 0,
    errorClass: "ingest_failed",
    errorMessage: err instanceof Error ? err.message : "unknown",
  };
}

registerNangoHandler({
  providerConfigKey: "stripe",
  syncName: "stripe-charges",
  handler: handleCharges,
});
registerNangoHandler({
  providerConfigKey: "stripe",
  syncName: "stripe-customers",
  handler: handleCustomers,
});
registerNangoHandler({
  providerConfigKey: "stripe",
  syncName: "stripe-subscriptions",
  handler: handleSubscriptions,
});
