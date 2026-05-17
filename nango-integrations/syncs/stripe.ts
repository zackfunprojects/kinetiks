/**
 * Nango syncs — Stripe — three sync scripts in one file.
 *
 * Each function is exported as the default for its respective sync. The
 * Nango deploy step (`npx nango deploy`) resolves sync name → function
 * via the syncs/ filename pattern; we name the functions descriptively
 * for readability but the runtime entrypoint is `default export`.
 *
 * If Nango's CLI requires one sync per file, split into:
 *   syncs/stripe/charges.ts
 *   syncs/stripe/customers.ts
 *   syncs/stripe/subscriptions.ts
 * Done as a Slice 6 follow-up if the deploy step fails.
 */

import { createHash } from "node:crypto";
import type { NangoSync } from "@nangohq/sync";

interface StripeCharge {
  id: string;
  amount: number;
  currency: string;
  paid: boolean;
  refunded: boolean;
  refund_amount: number;
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
  plan_amount: number;
  plan_interval: string;
  plan_interval_count: number;
  current_period_start: string;
  current_period_end: string;
  canceled_at: string;
  created_at: string;
}

function hashEmail(raw: string | null | undefined): string {
  if (!raw) return "";
  const norm = raw.trim().toLowerCase();
  if (!norm) return "";
  return createHash("sha256").update(norm).digest("hex");
}

function emailDomain(raw: string | null | undefined): string {
  if (!raw) return "";
  const parts = raw.toLowerCase().split("@");
  return parts.length === 2 ? parts[1]! : "";
}

function toIso(unixSeconds: number | null | undefined): string {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) return "";
  return new Date(unixSeconds * 1000).toISOString();
}

function metadataString(meta: unknown, key: string): string {
  if (!meta || typeof meta !== "object") return "";
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

// ─── Stripe: Charges ────────────────────────────────────────

export async function fetchStripeCharges(nango: NangoSync): Promise<void> {
  const lastSync = (await nango.lastSyncDate?.()) ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const sinceUnix = Math.floor(lastSync.getTime() / 1000);

  let startingAfter: string | undefined = undefined;
  const MAX_PAGES = 200;

  for (let i = 0; i < MAX_PAGES; i++) {
    const response = await nango.proxy({
      method: "GET",
      endpoint: "/v1/charges",
      params: {
        limit: "100",
        "created[gte]": String(sinceUnix),
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      retries: 3,
    });
    const body = response.data as { data: Array<Record<string, unknown>>; has_more: boolean };
    const charges = body?.data ?? [];
    if (charges.length === 0) break;

    const records: StripeCharge[] = charges.map((c) => ({
      id: String(c.id ?? ""),
      amount: typeof c.amount === "number" ? c.amount : 0,
      currency: typeof c.currency === "string" ? c.currency : "",
      paid: c.paid === true,
      refunded: c.refunded === true,
      refund_amount: typeof c.amount_refunded === "number" ? c.amount_refunded : 0,
      customer_id: typeof c.customer === "string" ? c.customer : "",
      payment_method: extractPaymentMethod(c.payment_method_details),
      utm_source: metadataString(c.metadata, "utm_source"),
      utm_medium: metadataString(c.metadata, "utm_medium"),
      utm_campaign: metadataString(c.metadata, "utm_campaign"),
      created_at: toIso(c.created as number),
    }));

    await nango.batchSave<StripeCharge>(records, "StripeCharge");

    if (!body.has_more) break;
    startingAfter = charges[charges.length - 1]!.id as string;
  }
}

function extractPaymentMethod(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  const d = details as Record<string, unknown>;
  const type = d.type;
  return typeof type === "string" ? type : "";
}

// ─── Stripe: Customers ──────────────────────────────────────

export async function fetchStripeCustomers(nango: NangoSync): Promise<void> {
  const lastSync = (await nango.lastSyncDate?.()) ?? new Date(0);
  const sinceUnix = Math.floor(lastSync.getTime() / 1000);

  let startingAfter: string | undefined = undefined;
  const MAX_PAGES = 200;

  for (let i = 0; i < MAX_PAGES; i++) {
    const response = await nango.proxy({
      method: "GET",
      endpoint: "/v1/customers",
      params: {
        limit: "100",
        "created[gte]": String(sinceUnix),
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      retries: 3,
    });
    const body = response.data as { data: Array<Record<string, unknown>>; has_more: boolean };
    const customers = body?.data ?? [];
    if (customers.length === 0) break;

    const records: StripeCustomer[] = customers.map((c) => ({
      id: String(c.id ?? ""),
      email_lower_hash: hashEmail(typeof c.email === "string" ? c.email : null),
      domain: emailDomain(typeof c.email === "string" ? c.email : null),
      created_at: toIso(c.created as number),
    }));

    await nango.batchSave<StripeCustomer>(records, "StripeCustomer");

    if (!body.has_more) break;
    startingAfter = customers[customers.length - 1]!.id as string;
  }
}

// ─── Stripe: Subscriptions ──────────────────────────────────

export async function fetchStripeSubscriptions(nango: NangoSync): Promise<void> {
  let startingAfter: string | undefined = undefined;
  const MAX_PAGES = 200;

  for (let i = 0; i < MAX_PAGES; i++) {
    const response = await nango.proxy({
      method: "GET",
      endpoint: "/v1/subscriptions",
      params: {
        limit: "100",
        status: "all",
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      retries: 3,
    });
    const body = response.data as { data: Array<Record<string, unknown>>; has_more: boolean };
    const subs = body?.data ?? [];
    if (subs.length === 0) break;

    const records: StripeSubscription[] = subs.map((s) => {
      const plan = (s.plan as Record<string, unknown>) ?? {};
      return {
        id: String(s.id ?? ""),
        status: typeof s.status === "string" ? s.status : "",
        customer_id: typeof s.customer === "string" ? s.customer : "",
        plan_amount: typeof plan.amount === "number" ? plan.amount : 0,
        plan_interval: typeof plan.interval === "string" ? plan.interval : "",
        plan_interval_count:
          typeof plan.interval_count === "number" ? plan.interval_count : 1,
        current_period_start: toIso(s.current_period_start as number),
        current_period_end: toIso(s.current_period_end as number),
        canceled_at: s.canceled_at ? toIso(s.canceled_at as number) : "",
        created_at: toIso(s.created as number),
      };
    });

    await nango.batchSave<StripeSubscription>(records, "StripeSubscription");

    if (!body.has_more) break;
    startingAfter = subs[subs.length - 1]!.id as string;
  }
}

// Default export — the Nango CLI invokes this for the stripe-charges sync.
// stripe-customers and stripe-subscriptions deploy as separate sync files
// in production; this file is the staging form (Slice 6 follow-up will
// split if Nango's CLI requires one default export per file).
export default fetchStripeCharges;
