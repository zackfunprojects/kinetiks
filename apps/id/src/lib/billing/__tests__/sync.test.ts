import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(async () => undefined),
}));
vi.mock("@/lib/observability/sentry", () => ({
  captureException: captureExceptionMock,
}));
const { planForPriceIdMock, fetchPaymentMethodMock } = vi.hoisted(() => ({
  planForPriceIdMock: vi.fn(),
  fetchPaymentMethodMock: vi.fn(),
}));
vi.mock("../stripe", async (importOriginal) => {
  const original = await importOriginal<typeof import("../stripe")>();
  return {
    ...original,
    planForPriceId: planForPriceIdMock,
    fetchPaymentMethod: fetchPaymentMethodMock,
  };
});

import { createAdminClient } from "@/lib/supabase/admin";
import { syncSubscriptionToBilling, type BillingRowSnapshot } from "../sync";
import type { StripeSubscription } from "../stripe";

const mockCreateAdmin = vi.mocked(createAdminClient);

interface AdminCapture {
  updates: Array<Record<string, unknown>>;
  ledger: Array<Record<string, unknown>>;
}

function stubAdmin(opts?: { updateError?: { message: string } }): AdminCapture {
  const captured: AdminCapture = { updates: [], ledger: [] };
  const from = vi.fn((table: string) => {
    if (table === "kinetiks_billing") {
      return {
        update: vi.fn((row: Record<string, unknown>) => {
          captured.updates.push(row);
          return {
            eq: vi.fn(async () => ({ error: opts?.updateError ?? null })),
          };
        }),
      };
    }
    if (table === "kinetiks_ledger") {
      return {
        insert: vi.fn((row: Record<string, unknown>) => {
          captured.ledger.push(row);
          return Promise.resolve({ error: null });
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  mockCreateAdmin.mockReturnValue({ from } as never);
  return captured;
}

function snapshot(overrides: Partial<BillingRowSnapshot> = {}): BillingRowSnapshot {
  return {
    account_id: "acc-1",
    plan: "free",
    plan_status: "active",
    stripe_customer_id: "cus_1",
    stripe_subscription_id: null,
    ...overrides,
  };
}

function subscription(
  overrides: Partial<StripeSubscription> = {},
): StripeSubscription {
  return {
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    current_period_end: 1_700_000_000,
    default_payment_method: null,
    items: { data: [{ price: { id: "price_pro" } }] },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  planForPriceIdMock.mockImplementation((id: string) =>
    id === "price_pro" ? "pro" : id === "price_team" ? "team" : null,
  );
  fetchPaymentMethodMock.mockResolvedValue({ id: "pm_1", card: { last4: "4242" } });
});

describe("syncSubscriptionToBilling", () => {
  it("activates a paid plan: row updated, seeds reset, started event written", async () => {
    const captured = stubAdmin();
    const result = await syncSubscriptionToBilling(snapshot(), subscription());

    expect(result.plan).toBe("pro");
    expect(result.events_written).toEqual(["billing_subscription_started"]);

    const update = captured.updates[0];
    expect(update.plan).toBe("pro");
    expect(update.plan_status).toBe("active");
    expect(update.stripe_subscription_id).toBe("sub_1");
    expect(update.seeds_balance).toBe(2000);
    expect(update.current_period_end).toBe(new Date(1_700_000_000 * 1000).toISOString());

    expect(captured.ledger).toHaveLength(1);
    expect(captured.ledger[0]).toMatchObject({
      account_id: "acc-1",
      event_type: "billing_subscription_started",
      detail: { plan: "pro", stripe_subscription_id: "sub_1" },
    });
  });

  it("records a plan change between paid tiers", async () => {
    const captured = stubAdmin();
    const result = await syncSubscriptionToBilling(
      snapshot({ plan: "pro", stripe_subscription_id: "sub_1" }),
      subscription({ items: { data: [{ price: { id: "price_team" } }] } }),
    );
    expect(result.events_written).toEqual(["billing_plan_changed"]);
    expect(captured.updates[0].plan).toBe("team");
    expect(captured.updates[0].seeds_balance).toBe(10000);
    expect(captured.ledger[0]).toMatchObject({
      event_type: "billing_plan_changed",
      detail: { previous_plan: "pro", plan: "team" },
    });
  });

  it("does not write transition events when nothing changed", async () => {
    const captured = stubAdmin();
    const result = await syncSubscriptionToBilling(
      snapshot({ plan: "pro", stripe_subscription_id: "sub_1" }),
      subscription(),
    );
    expect(result.events_written).toEqual([]);
    expect(captured.ledger).toHaveLength(0);
    // No plan change and no new subscription → seeds untouched.
    expect(captured.updates[0]).not.toHaveProperty("seeds_balance");
  });

  it("cancellation reverts to free, clears linkage, writes canceled event", async () => {
    const captured = stubAdmin();
    const result = await syncSubscriptionToBilling(
      snapshot({ plan: "team", stripe_subscription_id: "sub_1" }),
      subscription({ status: "canceled" }),
    );
    expect(result.plan).toBe("free");
    expect(result.plan_status).toBe("canceled");
    expect(result.events_written).toEqual(["billing_subscription_canceled"]);
    const update = captured.updates[0];
    expect(update.plan).toBe("free");
    expect(update.stripe_subscription_id).toBeNull();
    expect(update.current_period_end).toBeNull();
    expect(update.seeds_balance).toBe(50);
    expect(captured.ledger[0]).toMatchObject({
      event_type: "billing_subscription_canceled",
      detail: { previous_plan: "team" },
    });
  });

  it("keeps the previous plan and reports to Sentry on unknown price (config drift)", async () => {
    const captured = stubAdmin();
    const result = await syncSubscriptionToBilling(
      snapshot({ plan: "pro", stripe_subscription_id: "sub_1" }),
      subscription({ items: { data: [{ price: { id: "price_mystery" } }] } }),
    );
    expect(result.plan).toBe("pro");
    expect(captured.updates[0].plan).toBe("pro");
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ stage: "price_mapping" }),
      }),
    );
  });

  it("stores card last4 best-effort and never fails the sync on lookup error", async () => {
    const captured = stubAdmin();
    fetchPaymentMethodMock.mockRejectedValueOnce(new Error("stripe down"));
    await syncSubscriptionToBilling(
      snapshot(),
      subscription({ default_payment_method: "pm_1" }),
    );
    expect(captured.updates[0]).not.toHaveProperty("payment_method_last4");

    fetchPaymentMethodMock.mockResolvedValueOnce({ id: "pm_1", card: { last4: "4242" } });
    await syncSubscriptionToBilling(
      snapshot(),
      subscription({ default_payment_method: "pm_1" }),
    );
    expect(captured.updates[1].payment_method_last4).toBe("4242");
  });

  it("throws when the billing row update fails (webhook must retry)", async () => {
    stubAdmin({ updateError: { message: "connection reset" } });
    await expect(
      syncSubscriptionToBilling(snapshot(), subscription()),
    ).rejects.toThrow(/billing row update failed/);
  });
});
