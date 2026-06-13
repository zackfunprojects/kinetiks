/**
 * Minimal typed Stripe REST client — Phase E1.
 *
 * Raw HTTPS against api.stripe.com (the repo precedent set by the
 * portal route): no Stripe SDK dependency, no webhook framework. Only
 * the five calls billing acquisition needs:
 *
 *   - create customer            (idempotent per account)
 *   - create Checkout Session    (mode=subscription)
 *   - create Billing Portal session
 *   - fetch subscription         (authoritative re-sync on webhooks)
 *   - fetch payment method       (card last4 for the billing card)
 *
 * plus `verifyStripeSignature` for the webhook route (Stripe's
 * `t=...,v1=...` scheme: HMAC-SHA256 over `${t}.${rawBody}`,
 * timing-safe compare, replay tolerance both directions).
 *
 * Error posture: every failure throws `StripeApiError` carrying the
 * upstream status/message for Sentry at the caller. Raw Stripe
 * messages never reach a customer — routes map to USER_SAFE constants.
 *
 * Configuration: `STRIPE_SECRET_KEY` enables the API; the three
 * `STRIPE_PRICE_*` vars map paid plans to Stripe Prices; missing
 * config renders the honest "not configured" state in the UI and a
 * configuration error in the routes (never a silent fallback).
 */

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { BillingPlan, BillingPlanStatus } from "@kinetiks/types";
import { serverEnv } from "@kinetiks/lib/env";
import { fetchWithTimeout } from "@kinetiks/tools";

const STRIPE_API_BASE = "https://api.stripe.com";
const STRIPE_TIMEOUT_MS = 10_000;

/** Replay tolerance for webhook signatures (Stripe's documented default). */
export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

export class StripeApiError extends Error {
  readonly status: number;
  readonly stripeCode: string | null;

  constructor(message: string, status: number, stripeCode: string | null = null) {
    super(message);
    this.name = "StripeApiError";
    this.status = status;
    this.stripeCode = stripeCode;
  }
}

// ============================================================
// Configuration
// ============================================================

export type PaidPlan = Exclude<BillingPlan, "free">;

const PAID_PLANS: readonly PaidPlan[] = ["starter", "pro", "team"] as const;

export function isPaidPlan(plan: string): plan is PaidPlan {
  return (PAID_PLANS as readonly string[]).includes(plan);
}

function priceEnv(): Record<PaidPlan, string | undefined> {
  const env = serverEnv();
  return {
    starter: env.STRIPE_PRICE_STARTER,
    pro: env.STRIPE_PRICE_PRO,
    team: env.STRIPE_PRICE_TEAM,
  };
}

/** The Stripe Price id for a paid plan; null when not configured. */
export function priceIdForPlan(plan: PaidPlan): string | null {
  return priceEnv()[plan] ?? null;
}

/** Reverse lookup: which paid plan a Stripe Price id maps to. */
export function planForPriceId(priceId: string): PaidPlan | null {
  const prices = priceEnv();
  for (const plan of PAID_PLANS) {
    if (prices[plan] === priceId) return plan;
  }
  return null;
}

/** True when the API key is present (portal + customer ops possible). */
export function stripeConfigured(): boolean {
  return Boolean(serverEnv().STRIPE_SECRET_KEY);
}

/**
 * True when Checkout can sell at least one paid plan: API key plus a
 * price id. The UI uses the per-plan map to disable unsellable tiers.
 */
export function checkoutConfigured(): boolean {
  if (!stripeConfigured()) return false;
  const prices = priceEnv();
  return PAID_PLANS.some((p) => Boolean(prices[p]));
}

/** Per-plan purchasability for the plan-picker. */
export function purchasablePlans(): Record<PaidPlan, boolean> {
  const configured = stripeConfigured();
  const prices = priceEnv();
  return {
    starter: configured && Boolean(prices.starter),
    pro: configured && Boolean(prices.pro),
    team: configured && Boolean(prices.team),
  };
}

/** True when the webhook route can verify signatures. */
export function webhookConfigured(): boolean {
  return Boolean(serverEnv().STRIPE_WEBHOOK_SECRET);
}

// ============================================================
// Form encoding (Stripe bracket notation)
// ============================================================

/**
 * Flatten a nested params object into Stripe's bracket notation:
 * `{ line_items: [{ price: "p", quantity: 1 }] }` →
 * `line_items[0][price]=p&line_items[0][quantity]=1`.
 *
 * Undefined/null values are dropped. Booleans/numbers stringify.
 */
export function encodeStripeParams(
  params: Record<string, unknown>,
): URLSearchParams {
  const out = new URLSearchParams();
  const walk = (prefix: string, value: unknown): void => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(`${prefix}[${i}]`, v));
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(prefix ? `${prefix}[${k}]` : k, v);
      }
      return;
    }
    out.append(prefix, String(value));
  };
  walk("", params);
  return out;
}

// ============================================================
// Core request
// ============================================================

interface StripeRequestOptions {
  method: "GET" | "POST";
  /** POST body params (bracket-encoded). Ignored for GET. */
  params?: Record<string, unknown>;
  /**
   * Stripe idempotency key (POST only). Stripe replays the original
   * response for 24h on key reuse — this is what makes double-clicked
   * checkout buttons and webhook-triggered re-creations safe.
   */
  idempotencyKey?: string;
}

async function stripeRequest<T>(
  path: string,
  options: StripeRequestOptions,
): Promise<T> {
  const key = serverEnv().STRIPE_SECRET_KEY;
  if (!key) {
    throw new StripeApiError("Stripe is not configured (missing STRIPE_SECRET_KEY)", 0);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
  };
  let body: string | undefined;
  if (options.method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = encodeStripeParams(options.params ?? {}).toString();
    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }
  }

  let response: Response;
  try {
    response = await fetchWithTimeout({
      url: `${STRIPE_API_BASE}${path}`,
      init: { method: options.method, headers, body },
      timeoutMs: STRIPE_TIMEOUT_MS,
      tool: "stripe_billing",
    });
  } catch (err) {
    throw new StripeApiError(
      `Stripe request failed: ${err instanceof Error ? err.message : "network error"}`,
      0,
    );
  }

  const json = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & { error?: { message?: string; code?: string } })
    | null;

  if (!response.ok) {
    throw new StripeApiError(
      json?.error?.message ?? `Stripe responded ${response.status}`,
      response.status,
      json?.error?.code ?? null,
    );
  }
  if (json === null) {
    throw new StripeApiError("Stripe returned a non-JSON success body", response.status);
  }
  return json as T;
}

// ============================================================
// Typed surface (only the fields billing reads)
// ============================================================

export interface StripeCustomer {
  id: string;
}

export interface StripeCheckoutSession {
  id: string;
  url: string | null;
  customer: string | null;
  subscription: string | null;
}

export interface StripePortalSession {
  url: string;
}

export interface StripeSubscriptionItem {
  price: { id: string };
}

export interface StripeSubscription {
  id: string;
  status:
    | "active"
    | "trialing"
    | "past_due"
    | "incomplete"
    | "incomplete_expired"
    | "unpaid"
    | "canceled"
    | "paused";
  customer: string;
  current_period_end: number | null;
  default_payment_method: string | null;
  items: { data: StripeSubscriptionItem[] };
}

export interface StripePaymentMethod {
  id: string;
  card?: { last4?: string };
}

export async function createCustomer(args: {
  accountId: string;
  email: string;
}): Promise<StripeCustomer> {
  return stripeRequest<StripeCustomer>("/v1/customers", {
    method: "POST",
    params: {
      email: args.email,
      metadata: { kinetiks_account_id: args.accountId },
    },
    // One customer per account, ever: a concurrent double-create
    // replays the first response instead of minting a second customer.
    idempotencyKey: `kinetiks-customer-${args.accountId}`,
  });
}

export async function createCheckoutSession(args: {
  customerId: string;
  priceId: string;
  accountId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<StripeCheckoutSession> {
  return stripeRequest<StripeCheckoutSession>("/v1/checkout/sessions", {
    method: "POST",
    params: {
      mode: "subscription",
      customer: args.customerId,
      client_reference_id: args.accountId,
      line_items: [{ price: args.priceId, quantity: 1 }],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      subscription_data: { metadata: { kinetiks_account_id: args.accountId } },
    },
    // A double-clicked Upgrade (or a retried request) must not mint two
    // Checkout Sessions. Scope the key to (account, price): all params
    // above are deterministic for that pair, so Stripe replays the
    // original session for 24h instead of opening a second one. A
    // genuine later re-subscribe to the same plan (after the key ages
    // out) gets a fresh session.
    idempotencyKey: `kinetiks-checkout-${args.accountId}-${args.priceId}`,
  });
}

export async function createPortalSession(args: {
  customerId: string;
  returnUrl: string;
}): Promise<StripePortalSession> {
  return stripeRequest<StripePortalSession>("/v1/billing_portal/sessions", {
    method: "POST",
    params: { customer: args.customerId, return_url: args.returnUrl },
  });
}

export async function fetchSubscription(
  subscriptionId: string,
): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>(
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { method: "GET" },
  );
}

export async function fetchPaymentMethod(
  paymentMethodId: string,
): Promise<StripePaymentMethod> {
  return stripeRequest<StripePaymentMethod>(
    `/v1/payment_methods/${encodeURIComponent(paymentMethodId)}`,
    { method: "GET" },
  );
}

/**
 * Map a Stripe subscription status onto the four-state
 * `BillingPlanStatus`. `incomplete`/`unpaid` mean "payment needs
 * attention" → past_due; terminal/no-access states → canceled.
 */
export function planStatusFromStripe(
  status: StripeSubscription["status"],
): BillingPlanStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "incomplete":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "canceled";
  }
}

// ============================================================
// Webhook signature verification
// ============================================================

export interface SignatureVerification {
  ok: boolean;
  reason?: string;
}

/**
 * Verify a `stripe-signature` header against the raw request body.
 *
 * Scheme: header carries `t=<unix>,v1=<hex>[,v1=<hex>...]`; the signed
 * payload is `${t}.${rawBody}` HMAC-SHA256'd with the endpoint secret.
 * Any matching v1 passes (Stripe sends multiples during secret rolls).
 * Timestamps outside the tolerance window — either direction — are
 * replays/clock-skew and fail closed.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  opts?: { toleranceSeconds?: number; nowSeconds?: number },
): SignatureVerification {
  if (!signatureHeader) return { ok: false, reason: "missing signature header" };

  const tolerance = opts?.toleranceSeconds ?? STRIPE_SIGNATURE_TOLERANCE_SECONDS;
  const now = opts?.nowSeconds ?? Math.floor(Date.now() / 1000);

  let timestamp: number | null = null;
  const candidates: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === "t") {
      const parsed = Number.parseInt(v, 10);
      if (Number.isFinite(parsed)) timestamp = parsed;
    } else if (k === "v1") {
      candidates.push(v);
    }
  }

  if (timestamp === null) return { ok: false, reason: "malformed header: no timestamp" };
  if (candidates.length === 0) return { ok: false, reason: "malformed header: no v1 signature" };
  if (Math.abs(now - timestamp) > tolerance) {
    return { ok: false, reason: "timestamp outside tolerance" };
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");

  for (const candidate of candidates) {
    const candidateBuf = Buffer.from(candidate, "utf8");
    if (
      candidateBuf.length === expectedBuf.length &&
      timingSafeEqual(candidateBuf, expectedBuf)
    ) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "signature mismatch" };
}
