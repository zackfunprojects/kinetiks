"use client";

import { useEffect, useState } from "react";
import type { BillingRecord } from "@kinetiks/types";
import { BillingPage, type BillingConfig } from "@/components/billing/BillingPage";

const LOAD_ERROR_MESSAGE = "We couldn't load your billing details. Try again.";

/**
 * C2 — the live billing section: current plan, seeds balance, payment
 * method, plan comparison, and the Stripe portal. Reuses BillingPage
 * (the legacy (dashboard)/billing surface) with the modal supplying
 * the section heading; data comes from GET /api/billing because the
 * modal is a client surface.
 *
 * E1 — the response now also carries the deployment's Stripe
 * configuration (which plans are purchasable, whether the portal is
 * available) so the plan-picker renders honest states.
 */
export function BillingSettings() {
  const [billing, setBilling] = useState<BillingRecord | null>(null);
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/billing");
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = await res.json();
        const envelope = json.data ?? json;
        if (!cancelled) {
          setBilling((envelope.billing ?? null) as BillingRecord | null);
          setConfig((envelope.config ?? null) as BillingConfig | null);
        }
      } catch {
        if (!cancelled) setError(LOAD_ERROR_MESSAGE);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h3
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "var(--kt-fg-1)",
          margin: "0 0 24px",
        }}
      >
        Billing
      </h3>

      {loading ? (
        <div aria-busy="true" aria-live="polite" aria-label="Loading billing">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 72,
                marginBottom: 12,
                borderRadius: 8,
                background: "var(--kt-bg-muted)",
                opacity: 0.5,
              }}
            />
          ))}
        </div>
      ) : error ? (
        <p role="alert" style={{ fontSize: 14, color: "var(--kt-fg-2)", margin: 0 }}>
          {error}
        </p>
      ) : (
        <BillingPage billing={billing} config={config} hideHeader />
      )}
    </div>
  );
}
