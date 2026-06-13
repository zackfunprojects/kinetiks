import { createHmac } from "node:crypto";
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
vi.mock("@kinetiks/lib/env", () => ({
  serverEnv: vi.fn(() => ({ STRIPE_WEBHOOK_SECRET: "whsec_test" })),
}));
const { fetchSubscriptionMock, syncMock } = vi.hoisted(() => ({
  fetchSubscriptionMock: vi.fn(),
  syncMock: vi.fn(),
}));
vi.mock("@/lib/billing/stripe", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/billing/stripe")>();
  return { ...original, fetchSubscription: fetchSubscriptionMock };
});
vi.mock("@/lib/billing/sync", () => ({
  syncSubscriptionToBilling: syncMock,
}));

import { serverEnv } from "@kinetiks/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "./route";

const mockServerEnv = vi.mocked(serverEnv);
const mockCreateAdmin = vi.mocked(createAdminClient);

const SECRET = "whsec_test";

function signedRequest(payload: unknown, opts?: { signature?: string }): Request {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature =
    opts?.signature ??
    `t=${timestamp},v1=${createHmac("sha256", SECRET)
      .update(`${timestamp}.${body}`)
      .digest("hex")}`;
  return new Request("https://id.kinetiks.test/api/billing/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": signature },
    body,
  });
}

const BILLING_ROW = {
  account_id: "acc-1",
  plan: "pro",
  plan_status: "active",
  stripe_customer_id: "cus_1",
  stripe_subscription_id: "sub_1",
};

interface AdminStubOptions {
  billingRow?: typeof BILLING_ROW | null;
  claimError?: { code?: string; message: string } | null;
}

function stubAdmin(options: AdminStubOptions = {}) {
  const claims: Array<Record<string, unknown>> = [];
  const claimDeletes: string[] = [];
  const billingUpdates: Array<Record<string, unknown>> = [];
  const ledger: Array<Record<string, unknown>> = [];
  const row = options.billingRow === undefined ? BILLING_ROW : options.billingRow;

  const from = vi.fn((table: string) => {
    if (table === "kinetiks_billing") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: row, error: null })),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          billingUpdates.push(payload);
          return { eq: vi.fn(async () => ({ error: null })) };
        }),
      };
    }
    if (table === "kinetiks_inbound_events") {
      return {
        insert: vi.fn((payload: Record<string, unknown>) => {
          claims.push(payload);
          return Promise.resolve({ error: options.claimError ?? null });
        }),
        delete: vi.fn(() => ({
          eq: vi.fn((_col: string, value: string) => {
            claimDeletes.push(value);
            return Promise.resolve({ error: null });
          }),
        })),
      };
    }
    if (table === "kinetiks_ledger") {
      return {
        insert: vi.fn((payload: Record<string, unknown>) => {
          ledger.push(payload);
          return Promise.resolve({ error: null });
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  mockCreateAdmin.mockReturnValue({ from } as never);
  return { claims, claimDeletes, billingUpdates, ledger };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockServerEnv.mockReturnValue({ STRIPE_WEBHOOK_SECRET: SECRET } as never);
  fetchSubscriptionMock.mockResolvedValue({
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    current_period_end: 1_700_000_000,
    default_payment_method: null,
    items: { data: [{ price: { id: "price_pro" } }] },
  });
  syncMock.mockResolvedValue({ plan: "pro", plan_status: "active", events_written: [] });
});

describe("POST /api/billing/webhook", () => {
  it("treats a missing webhook secret as a configuration error: 500 + Sentry", async () => {
    mockServerEnv.mockReturnValue({} as never);
    const res = await POST(signedRequest({ id: "evt_1", type: "invoice.paid", data: { object: {} } }));
    expect(res.status).toBe(500);
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ stage: "configuration" }),
      }),
    );
  });

  it("rejects an invalid signature with 401 and never touches the database", async () => {
    stubAdmin();
    const res = await POST(
      signedRequest(
        { id: "evt_1", type: "invoice.paid", data: { object: {} } },
        { signature: "t=123,v1=deadbeef" },
      ),
    );
    expect(res.status).toBe(401);
    expect(mockCreateAdmin).not.toHaveBeenCalled();
  });

  it("acks unhandled event types without claiming", async () => {
    const { claims } = stubAdmin();
    const res = await POST(
      signedRequest({ id: "evt_1", type: "payment_intent.created", data: { object: {} } }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ignored: true });
    expect(claims).toHaveLength(0);
  });

  it("acks events for customers we don't know (shared Stripe account)", async () => {
    stubAdmin({ billingRow: null });
    const res = await POST(
      signedRequest({
        id: "evt_1",
        type: "customer.subscription.updated",
        data: { object: { id: "sub_x", customer: "cus_unknown" } },
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ skipped: "unknown_customer" });
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("skips duplicate deliveries via the claim (exactly-once)", async () => {
    stubAdmin({ claimError: { code: "23505", message: "duplicate key" } });
    const res = await POST(
      signedRequest({
        id: "evt_dup",
        type: "customer.subscription.updated",
        data: { object: { id: "sub_1", customer: "cus_1" } },
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ duplicate: true });
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("checkout.session.completed resolves by client_reference_id and syncs the fresh subscription", async () => {
    const { claims } = stubAdmin();
    const res = await POST(
      signedRequest({
        id: "evt_2",
        type: "checkout.session.completed",
        data: {
          object: {
            client_reference_id: "acc-1",
            customer: "cus_1",
            subscription: "sub_new",
          },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(claims[0]).toMatchObject({
      source: "stripe",
      event_key: "stripe:evt_2",
      account_id: "acc-1",
    });
    expect(fetchSubscriptionMock).toHaveBeenCalledWith("sub_new");
    expect(syncMock).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: "acc-1" }),
      expect.objectContaining({ id: "sub_1" }),
    );
  });

  it("subscription events re-fetch from Stripe rather than trusting the payload", async () => {
    stubAdmin();
    const res = await POST(
      signedRequest({
        id: "evt_3",
        type: "customer.subscription.updated",
        data: { object: { id: "sub_1", customer: "cus_1", status: "stale_payload_state" } },
      }),
    );
    expect(res.status).toBe(200);
    expect(fetchSubscriptionMock).toHaveBeenCalledWith("sub_1");
    expect(syncMock).toHaveBeenCalled();
  });

  it("ignores the canceled tail of a superseded subscription", async () => {
    stubAdmin();
    fetchSubscriptionMock.mockResolvedValue({
      id: "sub_old",
      status: "canceled",
      customer: "cus_1",
      current_period_end: null,
      default_payment_method: null,
      items: { data: [] },
    });
    const res = await POST(
      signedRequest({
        id: "evt_4",
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_old", customer: "cus_1" } },
      }),
    );
    expect(res.status).toBe(200);
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("invoice.paid on a cycle resets the seeds quota and clears past_due", async () => {
    const { billingUpdates } = stubAdmin();
    const res = await POST(
      signedRequest({
        id: "evt_5",
        type: "invoice.paid",
        data: {
          object: { customer: "cus_1", billing_reason: "subscription_cycle" },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(billingUpdates[0]).toMatchObject({
      seeds_balance: 2000,
      plan_status: "active",
    });
  });

  it("invoice.paid outside a cycle (creation) is a no-op here", async () => {
    const { billingUpdates } = stubAdmin();
    await POST(
      signedRequest({
        id: "evt_6",
        type: "invoice.paid",
        data: {
          object: { customer: "cus_1", billing_reason: "subscription_create" },
        },
      }),
    );
    expect(billingUpdates).toHaveLength(0);
  });

  it("invoice.payment_failed flips past_due and writes the ledger event", async () => {
    const { billingUpdates, ledger } = stubAdmin();
    const res = await POST(
      signedRequest({
        id: "evt_7",
        type: "invoice.payment_failed",
        data: { object: { customer: "cus_1", attempt_count: 2 } },
      }),
    );
    expect(res.status).toBe(200);
    expect(billingUpdates[0]).toMatchObject({ plan_status: "past_due" });
    expect(ledger[0]).toMatchObject({
      event_type: "billing_payment_failed",
      detail: { plan: "pro", attempt_count: 2 },
    });
  });

  it("releases the claim and returns 500 when processing fails (Stripe retries)", async () => {
    const { claimDeletes } = stubAdmin();
    syncMock.mockRejectedValue(new Error("supabase down"));
    const res = await POST(
      signedRequest({
        id: "evt_8",
        type: "customer.subscription.updated",
        data: { object: { id: "sub_1", customer: "cus_1" } },
      }),
    );
    expect(res.status).toBe(500);
    expect(claimDeletes).toEqual(["stripe:evt_8"]);
    expect(captureExceptionMock).toHaveBeenCalled();
  });

  it("400s a signed but malformed payload", async () => {
    stubAdmin();
    const res = await POST(signedRequest({ nope: true }));
    expect(res.status).toBe(400);
  });
});
