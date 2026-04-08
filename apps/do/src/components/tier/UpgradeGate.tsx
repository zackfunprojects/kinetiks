"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { canAccess, requiredTier, type Feature } from "@/lib/tier-config";
import type { BillingTier } from "@kinetiks/deskof";
import { track } from "@/lib/analytics";

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
  /**
   * Trigger type for the conversion analytics event. Helps us
   * attribute upgrades back to the specific UI surface that motivated
   * them. Defaults to "timed" but callers should override for the
   * specific named triggers from Quality Addendum #10.5.
   */
  triggerType?:
    | "angle_lock"
    | "citation_teaser"
    | "quora_teaser"
    | "gate_preview"
    | "first_week_prompt"
    | "timed";
  /** Where in the app this gate lives, for analytics attribution */
  location?: string;
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
  triggerType = "timed",
  location = "unknown",
}: UpgradeGateProps) {
  const allowed = canAccess(feature, tier);

  // Fire upgrade_prompt_shown the first time a locked gate appears
  // for this user's session. The bootstrap analytics wrapper handles
  // dedup at the batch level; we just need to call track().
  useEffect(() => {
    if (allowed) return;
    track({
      name: "upgrade_prompt_shown",
      props: {
        trigger_type: triggerType,
        location,
      },
    });
  }, [allowed, triggerType, location]);

  if (allowed) {
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
        onClick={() =>
          track({
            name: "upgrade_prompt_tapped",
            props: {
              trigger_type: triggerType,
              target_tier: target === "free" ? "standard" : target,
            },
          })
        }
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
