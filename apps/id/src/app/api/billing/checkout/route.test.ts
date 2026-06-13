import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));
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
  serverEnv: vi.fn(() => ({ NEXT_PUBLIC_APP_URL: "https://id.kinetiks.test" })),
}));
const {
  stripeConfiguredMock,
  priceIdForPlanMock,
  createCustomerMock,
  createCheckoutSessionMock,
} = vi.hoisted(() => ({
  stripeConfiguredMock: vi.fn(() => true),
  priceIdForPlanMock: vi.fn((): string | null => "price_pro"),
  createCustomerMock: vi.fn(),
  createCheckoutSessionMock: vi.fn(),
}));
vi.mock("@/lib/billing/stripe", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/billing/stripe")>();
  return {
    ...original,
    stripeConfigured: stripeConfiguredMock,
    priceIdForPlan: priceIdForPlanMock,
    createCustomer: createCustomerMock,
    createCheckoutSession: createCheckoutSessionMock,
  };
});

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "./route";

const mockRequireAuth = vi.mocked(requireAuth);
const mockCreateAdmin = vi.mocked(createAdminClient);

function makeRequest(body: unknown): Request {
  return new Request("https://id.kinetiks.test/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

interface BillingRow {
  id: string;
  plan: string;
  plan_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

interface AdminStubOptions {
  /** null → no billing row exists yet (upsert path). */
  billingRow?: BillingRow | null;
  ownerEmail?: string;
}

function stubAdmin(options: AdminStubOptions = {}) {
  const writes: Array<Record<string, unknown>> = [];
  const upserts: Array<Record<string, unknown>> = [];
  const row =
    options.billingRow === undefined
      ? {
          id: "bill-1",
          plan: "free",
          plan_status: "active",
          stripe_customer_id: null,
          stripe_subscription_id: null,
        }
      : options.billingRow;

  const from = vi.fn((table: string) => {
    if (table === "kinetiks_billing") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: row, error: null })),
          })),
        })),
        upsert: vi.fn((payload: Record<string, unknown>) => {
          upserts.push(payload);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: "bill-new",
                  plan: "free",
                  plan_status: "active",
                  stripe_customer_id: null,
                  stripe_subscription_id: null,
                },
                error: null,
              })),
            })),
          };
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          writes.push(payload);
          return { eq: vi.fn(async () => ({ error: null })) };
        }),
      };
    }
    // kinetiks_accounts
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: { user_id: "user-1" },
            error: null,
          })),
        })),
      })),
    };
  });

  const auth = {
    admin: {
      getUserById: vi.fn(async () => ({
        data: { user: { email: options.ownerEmail ?? "Owner@Acme.test" } },
        error: null,
      })),
    },
  };

  mockCreateAdmin.mockReturnValue({ from, auth } as never);
  return { writes, upserts };
}

beforeEach(() => {
  vi.clearAllMocks();
  stripeConfiguredMock.mockReturnValue(true);
  priceIdForPlanMock.mockReturnValue("price_pro");
  createCustomerMock.mockResolvedValue({ id: "cus_new" });
  createCheckoutSessionMock.mockResolvedValue({
    id: "cs_1",
    url: "https://checkout.stripe.test/cs_1",
    customer: "cus_new",
    subscription: null,
  });
  mockRequireAuth.mockResolvedValue({
    auth: { account_id: "acc-1", auth_method: "session" } as never,
    error: null,
  });
});

describe("POST /api/billing/checkout", () => {
  it("rejects invalid plans with 400 (free is not checkout-able)", async () => {
    const res = await POST(makeRequest({ plan: "free" }));
    expect(res.status).toBe(400);
    const res2 = await POST(makeRequest({ plan: "enterprise" }));
    expect(res2.status).toBe(400);
    const res3 = await POST(makeRequest("not-an-object"));
    expect(res3.status).toBe(400);
  });

  it("returns 503 when Stripe is not configured for this plan", async () => {
    priceIdForPlanMock.mockReturnValue(null);
    stubAdmin();
    const res = await POST(makeRequest({ plan: "pro" }));
    expect(res.status).toBe(503);
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("refuses a second subscription with 409 (plan changes go to the portal)", async () => {
    stubAdmin({
      billingRow: {
        id: "bill-1",
        plan: "pro",
        plan_status: "active",
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_live",
      },
    });
    const res = await POST(makeRequest({ plan: "team" }));
    expect(res.status).toBe(409);
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("creates the Stripe customer on first checkout and persists stripe_customer_id", async () => {
    const { writes } = stubAdmin();
    const res = await POST(makeRequest({ plan: "pro" }));
    expect(res.status).toBe(200);

    expect(createCustomerMock).toHaveBeenCalledWith({
      accountId: "acc-1",
      email: "owner@acme.test",
    });
    expect(writes[0]).toMatchObject({ stripe_customer_id: "cus_new" });

    const body = await res.json();
    expect(body.data.url).toBe("https://checkout.stripe.test/cs_1");
    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cus_new",
        priceId: "price_pro",
        accountId: "acc-1",
        successUrl: "https://id.kinetiks.test/chat?checkout=success",
        cancelUrl: "https://id.kinetiks.test/chat?checkout=cancelled",
      }),
    );
  });

  it("reuses an existing Stripe customer without re-creating", async () => {
    const { writes } = stubAdmin({
      billingRow: {
        id: "bill-1",
        plan: "free",
        plan_status: "active",
        stripe_customer_id: "cus_existing",
        stripe_subscription_id: null,
      },
    });
    const res = await POST(makeRequest({ plan: "pro" }));
    expect(res.status).toBe(200);
    expect(createCustomerMock).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "cus_existing" }),
    );
  });

  it("initializes the billing row for a fresh account before checkout", async () => {
    const { upserts } = stubAdmin({ billingRow: null });
    const res = await POST(makeRequest({ plan: "pro" }));
    expect(res.status).toBe(200);
    expect(upserts[0]).toMatchObject({ account_id: "acc-1" });
  });

  it("maps Stripe failures to the generic error and reports to Sentry", async () => {
    stubAdmin();
    createCheckoutSessionMock.mockRejectedValue(new Error("stripe 500"));
    const res = await POST(makeRequest({ plan: "pro" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("We couldn't start checkout. Try again.");
    expect(body.error).not.toContain("stripe");
    expect(captureExceptionMock).toHaveBeenCalled();
  });
});
