/**
 * Tests for the Stripe handler's pure aggregations.
 *
 * Locks down:
 *   - aggregateCharges windows to 28d, sums + counts paid charges
 *   - refund_rate is refunds / total paid (not refunds / total volume)
 *   - aggregateCustomers counts created in last 28d
 *   - aggregateSubscriptions computes MRR from active subs honoring interval
 *   - churn_rate = canceled_28d / (active + canceled_28d)
 */

import { describe, expect, it } from "vitest";

import {
  aggregateCharges,
  aggregateCustomers,
  aggregateSubscriptions,
} from "../handlers/stripe";

const NOW = new Date("2026-05-17T12:00:00Z");
const day = (offset: number) =>
  new Date(NOW.getTime() - offset * 24 * 60 * 60 * 1000).toISOString();

describe("aggregateCharges", () => {
  it("sums paid charges over the last 28d", () => {
    const agg = aggregateCharges(
      [
        // recent paid
        chargeFx({ amount: 10000, paid: true, created_at: day(5) }),
        chargeFx({ amount: 5000, paid: true, created_at: day(20) }),
        // outside window — ignored
        chargeFx({ amount: 7777, paid: true, created_at: day(60) }),
        // unpaid — ignored
        chargeFx({ amount: 9999, paid: false, created_at: day(2) }),
      ],
      NOW
    );
    expect(agg.charges_total_28d).toBe(15000);
    expect(agg.charges_count_28d).toBe(2);
    expect(agg.avg_order_value_28d).toBe(75); // (15000 cents / 2) / 100 = $75
  });

  it("refund_rate is refunded charges as % of paid charges", () => {
    const agg = aggregateCharges(
      [
        chargeFx({ amount: 10000, paid: true, refund_amount: 0, created_at: day(5) }),
        chargeFx({ amount: 5000, paid: true, refund_amount: 5000, created_at: day(10) }),
      ],
      NOW
    );
    expect(agg.charges_count_28d).toBe(2);
    expect(agg.refunds_count_28d).toBe(1);
    expect(agg.refund_rate_28d).toBe(50);
  });

  it("returns zero for empty input", () => {
    const agg = aggregateCharges([], NOW);
    expect(agg.charges_total_28d).toBe(0);
    expect(agg.charges_count_28d).toBe(0);
    expect(agg.avg_order_value_28d).toBe(0);
    expect(agg.refund_rate_28d).toBe(0);
  });
});

describe("aggregateCustomers", () => {
  it("counts customers created in the last 28d", () => {
    const agg = aggregateCustomers(
      [
        customerFx({ created_at: day(5) }),
        customerFx({ created_at: day(15) }),
        customerFx({ created_at: day(60) }),
      ],
      NOW
    );
    expect(agg.new_customers_28d).toBe(2);
    expect(agg.total_customers).toBe(3);
  });
});

describe("aggregateSubscriptions", () => {
  it("MRR sums monthly-normalized plan amounts across active subs", () => {
    const agg = aggregateSubscriptions(
      [
        // $100/month active
        subFx({ status: "active", plan_amount: 10000, plan_interval: "month" }),
        // $1200/year active → $100/mo
        subFx({ status: "active", plan_amount: 120000, plan_interval: "year" }),
        // canceled — ignored from MRR
        subFx({ status: "canceled", plan_amount: 99999, plan_interval: "month", canceled_at: day(5) }),
      ],
      NOW
    );
    expect(agg.mrr).toBe(200); // $100 + $100
    expect(agg.arr).toBe(2400);
    expect(agg.active_count).toBe(2);
  });

  it("churn_rate = canceled_28d / (active + canceled_28d)", () => {
    const agg = aggregateSubscriptions(
      [
        subFx({ status: "active", plan_amount: 10000, plan_interval: "month" }),
        subFx({ status: "active", plan_amount: 10000, plan_interval: "month" }),
        subFx({ status: "active", plan_amount: 10000, plan_interval: "month" }),
        subFx({
          status: "canceled",
          plan_amount: 10000,
          plan_interval: "month",
          canceled_at: day(10),
        }),
      ],
      NOW
    );
    // active=3, canceled_28d=1 → 1 / 4 = 25%
    expect(agg.churn_rate_28d).toBe(25);
  });

  it("trialing subs count toward MRR/active", () => {
    const agg = aggregateSubscriptions(
      [
        subFx({ status: "trialing", plan_amount: 5000, plan_interval: "month" }),
      ],
      NOW
    );
    expect(agg.mrr).toBe(50);
    expect(agg.active_count).toBe(1);
  });
});

// ─── fixtures ─────────────────────────────────────────────

function chargeFx(o: Partial<Parameters<typeof aggregateCharges>[0][number]>) {
  return {
    id: "c1",
    amount: 1000,
    currency: "usd",
    paid: true,
    refunded: false,
    refund_amount: 0,
    customer_id: "",
    payment_method: "",
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    created_at: new Date().toISOString(),
    ...o,
  };
}

function customerFx(o: Partial<Parameters<typeof aggregateCustomers>[0][number]>) {
  return {
    id: "cus_1",
    email_lower_hash: "",
    domain: "",
    created_at: new Date().toISOString(),
    ...o,
  };
}

function subFx(o: Partial<Parameters<typeof aggregateSubscriptions>[0][number]>) {
  return {
    id: "sub_1",
    status: "active",
    customer_id: "cus_1",
    plan_amount: 10000,
    plan_interval: "month",
    plan_interval_count: 1,
    current_period_start: new Date().toISOString(),
    current_period_end: new Date().toISOString(),
    canceled_at: "",
    created_at: new Date().toISOString(),
    ...o,
  };
}
