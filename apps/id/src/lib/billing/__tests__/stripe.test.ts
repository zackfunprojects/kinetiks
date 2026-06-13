import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@kinetiks/lib/env", () => ({
  serverEnv: vi.fn(() => ({})),
}));

import { serverEnv } from "@kinetiks/lib/env";
import {
  checkoutConfigured,
  createCheckoutSession,
  createCustomer,
  encodeStripeParams,
  isPaidPlan,
  planForPriceId,
  planStatusFromStripe,
  priceIdForPlan,
  purchasablePlans,
  StripeApiError,
  stripeConfigured,
  verifyStripeSignature,
} from "../stripe";

const mockServerEnv = vi.mocked(serverEnv);

const FULL_ENV = {
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_PRICE_STARTER: "price_starter",
  STRIPE_PRICE_PRO: "price_pro",
  STRIPE_PRICE_TEAM: "price_team",
};

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  mockServerEnv.mockReturnValue(FULL_ENV as never);
});

// ============================================================
// Configuration mapping
// ============================================================

describe("plan/price configuration", () => {
  it("maps plans to configured price ids both directions", () => {
    expect(priceIdForPlan("starter")).toBe("price_starter");
    expect(priceIdForPlan("pro")).toBe("price_pro");
    expect(planForPriceId("price_team")).toBe("team");
    expect(planForPriceId("price_unknown")).toBeNull();
  });

  it("reports honest configuration state when env is missing", () => {
    mockServerEnv.mockReturnValue({} as never);
    expect(stripeConfigured()).toBe(false);
    expect(checkoutConfigured()).toBe(false);
    expect(priceIdForPlan("starter")).toBeNull();
    expect(purchasablePlans()).toEqual({ starter: false, pro: false, team: false });
  });

  it("treats a partially priced deployment as partially purchasable", () => {
    mockServerEnv.mockReturnValue({
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_PRICE_PRO: "price_pro",
    } as never);
    expect(checkoutConfigured()).toBe(true);
    expect(purchasablePlans()).toEqual({ starter: false, pro: true, team: false });
  });

  it("isPaidPlan excludes free and unknown values", () => {
    expect(isPaidPlan("starter")).toBe(true);
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan("enterprise")).toBe(false);
  });
});

// ============================================================
// Bracket encoding
// ============================================================

describe("encodeStripeParams", () => {
  it("flattens nested objects and arrays into bracket notation", () => {
    const out = encodeStripeParams({
      mode: "subscription",
      line_items: [{ price: "p1", quantity: 1 }],
      subscription_data: { metadata: { kinetiks_account_id: "acc-1" } },
      skipped: undefined,
      also_skipped: null,
    });
    expect(out.get("mode")).toBe("subscription");
    expect(out.get("line_items[0][price]")).toBe("p1");
    expect(out.get("line_items[0][quantity]")).toBe("1");
    expect(out.get("subscription_data[metadata][kinetiks_account_id]")).toBe("acc-1");
    expect([...out.keys()]).not.toContain("skipped");
    expect([...out.keys()]).not.toContain("also_skipped");
  });
});

// ============================================================
// Status mapping
// ============================================================

describe("planStatusFromStripe", () => {
  it("maps every Stripe status onto the four-state plan status", () => {
    expect(planStatusFromStripe("active")).toBe("active");
    expect(planStatusFromStripe("trialing")).toBe("trialing");
    expect(planStatusFromStripe("past_due")).toBe("past_due");
    expect(planStatusFromStripe("incomplete")).toBe("past_due");
    expect(planStatusFromStripe("unpaid")).toBe("past_due");
    expect(planStatusFromStripe("canceled")).toBe("canceled");
    expect(planStatusFromStripe("incomplete_expired")).toBe("canceled");
    expect(planStatusFromStripe("paused")).toBe("canceled");
  });
});

// ============================================================
// Webhook signature verification
// ============================================================

describe("verifyStripeSignature", () => {
  const SECRET = "whsec_test";
  const BODY = JSON.stringify({ id: "evt_1", type: "invoice.paid" });

  function sign(body: string, timestamp: number, secret = SECRET): string {
    const v1 = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    return `t=${timestamp},v1=${v1}`;
  }

  it("accepts a valid signature inside the tolerance window", () => {
    const now = 1_700_000_000;
    const header = sign(BODY, now - 30);
    expect(
      verifyStripeSignature(BODY, header, SECRET, { nowSeconds: now }),
    ).toEqual({ ok: true });
  });

  it("accepts when any one of multiple v1 candidates matches (secret roll)", () => {
    const now = 1_700_000_000;
    const good = createHmac("sha256", SECRET).update(`${now}.${BODY}`).digest("hex");
    const header = `t=${now},v1=${"0".repeat(64)},v1=${good}`;
    expect(
      verifyStripeSignature(BODY, header, SECRET, { nowSeconds: now }),
    ).toEqual({ ok: true });
  });

  it("rejects a signature computed with the wrong secret", () => {
    const now = 1_700_000_000;
    const header = sign(BODY, now, "whsec_other");
    expect(
      verifyStripeSignature(BODY, header, SECRET, { nowSeconds: now }).ok,
    ).toBe(false);
  });

  it("rejects timestamps outside tolerance in both directions", () => {
    const now = 1_700_000_000;
    expect(
      verifyStripeSignature(BODY, sign(BODY, now - 600), SECRET, { nowSeconds: now }).ok,
    ).toBe(false);
    expect(
      verifyStripeSignature(BODY, sign(BODY, now + 600), SECRET, { nowSeconds: now }).ok,
    ).toBe(false);
  });

  it("rejects a tampered body", () => {
    const now = 1_700_000_000;
    const header = sign(BODY, now);
    expect(
      verifyStripeSignature(`${BODY} `, header, SECRET, { nowSeconds: now }).ok,
    ).toBe(false);
  });

  it("rejects missing or malformed headers", () => {
    expect(verifyStripeSignature(BODY, null, SECRET).ok).toBe(false);
    expect(verifyStripeSignature(BODY, "garbage", SECRET).ok).toBe(false);
    expect(verifyStripeSignature(BODY, "t=abc,v1=def", SECRET).ok).toBe(false);
    expect(verifyStripeSignature(BODY, "v1=deadbeef", SECRET).ok).toBe(false);
    const now = 1_700_000_000;
    expect(
      verifyStripeSignature(BODY, `t=${now}`, SECRET, { nowSeconds: now }).ok,
    ).toBe(false);
  });
});

// ============================================================
// API surface
// ============================================================

describe("stripe API calls", () => {
  it("creates a customer with the account-scoped idempotency key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "cus_1" }));
    const customer = await createCustomer({
      accountId: "acc-1",
      email: "owner@acme.test",
    });
    expect(customer.id).toBe("cus_1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/customers");
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("kinetiks-customer-acc-1");
    expect(String(init.body)).toContain("metadata%5Bkinetiks_account_id%5D=acc-1");
  });

  it("creates a subscription-mode checkout session carrying the account reference", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" }),
    );
    const session = await createCheckoutSession({
      customerId: "cus_1",
      priceId: "price_pro",
      accountId: "acc-1",
      successUrl: "https://app/chat?checkout=success",
      cancelUrl: "https://app/chat?checkout=cancelled",
    });
    expect(session.url).toBe("https://checkout.stripe.test/cs_1");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = String(init.body);
    expect(body).toContain("mode=subscription");
    expect(body).toContain("client_reference_id=acc-1");
    expect(body).toContain("line_items%5B0%5D%5Bprice%5D=price_pro");
    // A double-clicked Upgrade replays the same session, not a second one.
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("kinetiks-checkout-acc-1-price_pro");
  });

  it("throws StripeApiError carrying upstream status and message", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { message: "No such price", code: "resource_missing" } }, 404),
    );
    await expect(
      createCustomer({ accountId: "acc-1", email: "o@a.test" }),
    ).rejects.toMatchObject({
      name: "StripeApiError",
      status: 404,
      stripeCode: "resource_missing",
    });
  });

  it("refuses to call out when the secret key is missing", async () => {
    mockServerEnv.mockReturnValue({} as never);
    await expect(
      createCustomer({ accountId: "acc-1", email: "o@a.test" }),
    ).rejects.toBeInstanceOf(StripeApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
