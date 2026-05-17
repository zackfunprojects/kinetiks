"use client";

import { useState } from "react";
import type { BillingRecord, BillingPlan } from "@kinetiks/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PLAN_DETAILS } from "@/lib/billing/plans";

interface BillingPageProps {
  billing: BillingRecord | null;
}

const PLANS: BillingPlan[] = ["free", "starter", "pro", "team"];

export function BillingPage({ billing }: BillingPageProps) {
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const currentPlan = billing?.plan || "free";
  const planInfo = PLAN_DETAILS[currentPlan];

  async function openPortal() {
    if (!billing?.stripe_customer_id) return;
    setLoadingPortal(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      if (!body?.url) {
        throw new Error("No portal URL returned");
      }
      window.location.href = body.url;
    } catch (e) {
      setPortalError(e instanceof Error ? e.message : "Failed to open billing portal");
    } finally {
      setLoadingPortal(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--kt-fg-1)" }}>
          Billing
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--kt-fg-2)" }}>
          Manage your subscription and payment details
        </p>
      </div>

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
                  disabled={loadingPortal}
                  style={{
                    padding: 0,
                    border: "none",
                    background: "none",
                    color: "var(--kt-accent)",
                    fontSize: 13,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  {loadingPortal ? "Loading..." : "Manage in Stripe"}
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
              {!isCurrent && (
                <button
                  onClick={openPortal}
                  disabled={loadingPortal || !billing?.stripe_customer_id}
                  style={{
                    width: "100%",
                    padding: "8px 0",
                    background: PLANS.indexOf(plan) > PLANS.indexOf(currentPlan) ? "var(--kt-accent-hover)" : "var(--kt-bg-subtle)",
                    color: PLANS.indexOf(plan) > PLANS.indexOf(currentPlan) ? "var(--kt-fg-on-inverse)" : "var(--kt-fg-2)",
                    border: PLANS.indexOf(plan) > PLANS.indexOf(currentPlan) ? "none" : "1px solid var(--kt-border-1)",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {PLANS.indexOf(plan) > PLANS.indexOf(currentPlan) ? "Upgrade" : "Downgrade"}
                </button>
              )}
            </Card>
          );
        })}
      </div>

      {/* Manage subscription */}
      {billing?.stripe_customer_id && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--kt-fg-1)" }}>
                Manage Subscription
              </h4>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--kt-fg-2)" }}>
                View invoices, update payment method, or cancel your plan
              </p>
            </div>
            <button
              onClick={openPortal}
              disabled={loadingPortal}
              style={{
                padding: "8px 20px",
                background: "var(--kt-accent-hover)",
                color: "var(--kt-fg-on-inverse)",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                cursor: loadingPortal ? "not-allowed" : "pointer",
              }}
            >
              {loadingPortal ? "Loading..." : "Open Stripe Portal"}
            </button>
          </div>
          {portalError && (
            <p role="alert" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--kt-danger)" }}>
              {portalError}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
