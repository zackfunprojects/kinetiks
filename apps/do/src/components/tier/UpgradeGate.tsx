"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { canAccess, requiredTier, type Feature } from "@/lib/tier-config";
import type { BillingTier } from "@kinetiks/deskof";

interface UpgradeGateProps {
  feature: Feature;
  /** Current user's tier — passed from server component */
  tier: BillingTier;
  /** Content shown when the user has access */
  children: ReactNode;
  /**
   * Optional override for the locked-state UI. Defaults to a contextual
   * "Upgrade to Standard / Hero" card.
   */
  fallback?: ReactNode;
  /**
   * If true, the locked state shows the children with a blur overlay
   * and lock icon — useful for teasers (citation feed, suggested angles).
   * If false, the locked state replaces children entirely.
   */
  teaser?: boolean;
}

const TIER_LABEL: Record<BillingTier, string> = {
  free: "Free",
  standard: "Standard",
  hero: "Hero",
};

const TIER_PRICE: Record<BillingTier, string> = {
  free: "$0/mo",
  standard: "$40/mo",
  hero: "$80/mo",
};

export function UpgradeGate({
  feature,
  tier,
  children,
  fallback,
  teaser = false,
}: UpgradeGateProps) {
  if (canAccess(feature, tier)) {
    return <>{children}</>;
  }

  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  const target = requiredTier(feature);

  const lockedCard = (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: "var(--border)",
        background: "var(--accent-subtle)",
      }}
    >
      <div className="mb-1 flex items-center gap-2">
        <LockIcon />
        <span
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--text-tertiary)" }}
        >
          {TIER_LABEL[target]} feature
        </span>
      </div>
      <p
        className="mb-3 text-sm"
        style={{ color: "var(--text-primary)" }}
      >
        Available on {TIER_LABEL[target]} ({TIER_PRICE[target]}).
      </p>
      <Link
        href={`/upgrade?feature=${feature}&target=${target}`}
        className="inline-flex items-center gap-1 text-sm font-medium"
        style={{ color: "var(--accent)" }}
      >
        Upgrade →
      </Link>
    </div>
  );

  if (!teaser) return lockedCard;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-sm">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        {lockedCard}
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ color: "var(--text-tertiary)" }}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
