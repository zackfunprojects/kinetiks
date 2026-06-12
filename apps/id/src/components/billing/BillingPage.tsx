"use client";

import { useState } from "react";
import type { BillingRecord, BillingPlan } from "@kinetiks/types";
import { Card, Badge } from "@kinetiks/ui";
import { PLAN_DETAILS } from "@/lib/billing/plans";
import { capture } from "@/lib/observability/posthog";

/** Deployment Stripe configuration, from GET /api/billing (E1). */
export interface BillingConfig {
  /** API key present — the portal can open for an existing customer. */
  portal: boolean;
  /** Which paid plans have a configured Stripe Price. */
  purchasable: Record<"starter" | "pro" | "team", boolean>;
}

interface BillingPageProps {
  billing: BillingRecord | null;
  /** Null when the loader predates E1 (treated as unconfigured). */
  config?: BillingConfig | null;
  /** C2 — the SettingsModal section supplies its own heading. */
  hideHeader?: boolean;
}

const PLANS: BillingPlan[] = ["free", "starter", "pro", "team"];

export function BillingPage({ billing, config, hideHeader }: BillingPageProps) {
  const [busy, setBusy] = useState<"portal" | BillingPlan | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const currentPlan = billing?.plan || "free";
  const planInfo = PLAN_DETAILS[currentPlan];
  // A live subscription means plan changes (and cancellation) belong
  // to the Stripe portal; Checkout only sells the first subscription.
  const hasLiveSubscription = Boolean(
    billing?.stripe_subscription_id && billing.plan_status !== "canceled",
  );
  const anyPurchasable = Boolean(
    config && (config.purchasable.starter || config.purchasable.pro || config.purchasable.team),
  );
  const checkoutAvailable = anyPurchasable;
  const portalAvailable = Boolean(config?.portal && billing?.stripe_customer_id);

  async function openPortal() {
    if (!portalAvailable || busy) return;
    setBusy("portal");
    setActionError(null);
    void capture("billing.portal_opened", { plan: currentPlan });
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const url = body?.data?.url ?? body?.url;
      if (!url) throw new Error("No portal URL returned");
      window.location.href = url;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to open billing portal");
      setBusy(null);
    }
  }

  async function startCheckout(plan: BillingPlan) {
    if (plan === "free" || busy) return;
    setBusy(plan);
    setActionError(null);
    void capture("billing.checkout_started", { plan });
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const url = body?.data?.url ?? body?.url;
      if (!url) throw new Error("No checkout URL returned");
      window.location.href = url;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to start checkout");
      setBusy(null);
    }
  }

  /**
   * What the action button on a non-current plan card does:
   *  - live subscription → every change routes to the portal
   *  - no subscription + paid plan → Checkout (when that price exists)
   *  - free card while paying → portal (cancel lives there)
   */
  function planAction(plan: BillingPlan): {
    label: string;
    onClick: () => void;
    disabled: boolean;
    emphasized: boolean;
  } | null {
    if (plan === currentPlan) return null;
    const upgrade = PLANS.indexOf(plan) > PLANS.indexOf(currentPlan);
    if (hasLiveSubscription) {
      return {
        label: upgrade ? "Upgrade" : "Downgrade",
        onClick: openPortal,
        disabled: !portalAvailable || busy !== null,
        emphasized: upgrade,
      };
    }
    if (plan === "free") return null; // already free without a subscription
    const purchasable = Boolean(
      config?.purchasable[plan as "starter" | "pro" | "team"],
    );
    return {
      label: purchasable ? "Upgrade" : "Not available",
      onClick: () => void startCheckout(plan),
      disabled: !purchasable || busy !== null,
      emphasized: purchasable,
    };
  }

  return (
    <div>
      {!hideHeader && (
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--kt-fg-1)" }}>
            Billing
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--kt-fg-2)" }}>
            Manage your subscription and payment details
          </p>
        </div>
      )}

      {/* Current plan + seeds */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <Card>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--kt-fg-3)" }}>Current Plan</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: "var(--kt-fg-1)" }}>
              {planInfo.name}
            </span>
            <Badge
              label={billing?.plan_status || "active"}
              variant={
                billing?.plan_status === "active" ? "success" :
                billing?.plan_status === "trialing" ? "accent" :
                billing?.plan_status === "past_due" ? "warning" : "error"
              }
            />
          </div>
          {billing?.current_period_end && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--kt-fg-3)" }}>
              Renews {new Date(billing.current_period_end).toLocaleDateString()}
            </p>
          )}
        </Card>

        <Card>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--kt-fg-3)" }}>Seeds Balance</p>
          <span style={{ fontSize: 24, fontWeight: 700, color: "var(--kt-accent)" }}>
            {(billing?.seeds_balance ?? 0).toLocaleString()}
          </span>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--kt-fg-3)" }}>
            {planInfo.seedsPerMonth.toLocaleString()} seeds/month included
          </p>
        </Card>

        <Card>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--kt-fg-3)" }}>Payment Method</p>
          {billing?.payment_method_last4 ? (
            <>
              <span style={{ fontSize: 18, fontWeight: 600, color: "var(--kt-fg-1)", fontFamily: "var(--font-mono), monospace" }}>
                **** {billing.payment_method_last4}
              </span>
              <p style={{ margin: "8px 0 0" }}>
                <button
                  onClick={openPortal}
                  disabled={!portalAvailable || busy !== null}
                  aria-busy={busy === "portal"}
                  style={{
                    padding: 0,
                    border: "none",
                    background: "none",
                    color: "var(--kt-accent)",
                    fontSize: 13,
                    cursor: portalAvailable && !busy ? "pointer" : "not-allowed",
                    textDecoration: "underline",
                  }}
                >
                  {busy === "portal" ? "Loading..." : "Manage in Stripe"}
                </button>
              </p>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: "var(--kt-fg-3)" }}>
              No payment method on file
            </p>
          )}
        </Card>
      </div>

      {/* Plan comparison */}
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "var(--kt-fg-1)" }}>
        Plans
      </h3>
      {config && !checkoutAvailable && !hasLiveSubscription && (
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--kt-fg-3)" }}>
          Subscriptions aren&apos;t configured for this deployment yet. Plan
          upgrades will appear here once they are.
        </p>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {PLANS.map((plan) => {
          const details = PLAN_DETAILS[plan];
          const isCurrent = plan === currentPlan;
          const action = planAction(plan);
          return (
            <Card
              key={plan}
              style={{
                border: isCurrent ? "2px solid var(--kt-accent)" : "1px solid var(--kt-border-1)",
                position: "relative",
              }}
            >
              {isCurrent && (
                <div
                  style={{
                    position: "absolute",
                    top: -1,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "var(--kt-accent-hover)",
                    color: "var(--kt-fg-on-inverse)",
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "0 0 6px 6px",
                  }}
                >
                  CURRENT
                </div>
              )}
              <div style={{ textAlign: "center", marginBottom: 16, paddingTop: isCurrent ? 8 : 0 }}>
                <h4 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600, color: "var(--kt-fg-1)" }}>
                  {details.name}
                </h4>
                <span style={{ fontSize: 28, fontWeight: 700, color: "var(--kt-fg-1)" }}>
                  {details.price}
                </span>
                <span style={{ fontSize: 13, color: "var(--kt-fg-3)" }}> /{details.priceNote}</span>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
                {details.features.map((feature) => (
                  <li
                    key={feature}
                    style={{
                      fontSize: 13,
                      color: "var(--kt-fg-2)",
                      padding: "4px 0",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 6,
                    }}
                  >
                    <span style={{ color: "var(--kt-success)", flexShrink: 0 }}>&#10003;</span>
                    {feature}
                  </li>
                ))}
              </ul>
              {action && (
                <button
                  onClick={action.onClick}
                  disabled={action.disabled}
                  aria-busy={busy === plan}
                  style={{
                    width: "100%",
                    padding: "8px 0",
                    background: action.emphasized ? "var(--kt-accent-hover)" : "var(--kt-bg-subtle)",
                    color: action.emphasized ? "var(--kt-fg-on-inverse)" : "var(--kt-fg-2)",
                    border: action.emphasized ? "none" : "1px solid var(--kt-border-1)",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: action.disabled ? "not-allowed" : "pointer",
                    opacity: action.disabled && action.label !== "Not available" ? 0.7 : 1,
                  }}
                >
                  {busy === plan ? "Redirecting..." : action.label}
                </button>
              )}
            </Card>
          );
        })}
      </div>

      {actionError && (
        <p role="alert" style={{ margin: "0 0 24px", fontSize: 13, color: "var(--kt-danger)" }}>
          {actionError}
        </p>
      )}

      {/* Manage subscription */}
      {billing?.stripe_customer_id && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--kt-fg-1)" }}>
                Manage Subscription
              </h4>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--kt-fg-2)" }}>
                View invoices, update payment method, change or cancel your plan
              </p>
            </div>
            <button
              onClick={openPortal}
              disabled={!portalAvailable || busy !== null}
              aria-busy={busy === "portal"}
              style={{
                padding: "8px 20px",
                background: "var(--kt-accent-hover)",
                color: "var(--kt-fg-on-inverse)",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                cursor: portalAvailable && busy === null ? "pointer" : "not-allowed",
              }}
            >
              {busy === "portal" ? "Loading..." : "Open Stripe Portal"}
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
