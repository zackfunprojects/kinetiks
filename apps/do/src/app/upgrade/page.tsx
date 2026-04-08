import Link from "next/link";
import { redirect } from "next/navigation";
import { requireDeskOfSession } from "@/lib/auth/session";
import {
  type Feature,
  allFeatures,
  canAccess,
} from "@/lib/tier-config";
import type { BillingTier } from "@kinetiks/deskof";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: { feature?: string; target?: string };
}

const KINETIKS_BILLING_URL =
  process.env.NEXT_PUBLIC_KINETIKS_BILLING_URL ??
  "https://id.kinetiks.ai/billing";

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

/**
 * Upgrade page — fixes the dead link from <UpgradeGate /> and gives
 * the user a structured view of what each tier unlocks.
 *
 * Phase 2.5 keeps this minimal: an explanation of the tier the user
 * was trying to reach, a contextual list of the features that tier
 * unlocks (sourced from lib/tier-config.ts so it stays in sync with
 * the gate matrix), and a button that hands off to Kinetiks ID for
 * the actual billing flow.
 */
export default async function UpgradePage({ searchParams }: Props) {
  const auth = await requireDeskOfSession();
  if ("error" in auth) redirect("/onboarding");
  const session = auth.session;

  const target = parseTarget(searchParams.target, session.tier);
  const triggerFeature = isFeature(searchParams.feature)
    ? searchParams.feature
    : null;

  // Features the target tier unlocks compared to the user's current tier
  const newFeatures = allFeatures().filter(
    (f) => !canAccess(f, session.tier) && canAccess(f, target)
  );

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <p
        className="mb-2 text-xs uppercase tracking-wider"
        style={{ color: "var(--text-tertiary)" }}
      >
        Upgrade to {TIER_LABEL[target]}
      </p>
      <h1
        className="mb-3 text-2xl font-semibold leading-tight"
        style={{ color: "var(--text-primary)" }}
      >
        {target === "standard"
          ? "Get the full intelligence layer."
          : "Strategic advantage, every day."}
      </h1>
      <p
        className="mb-6 text-sm leading-relaxed"
        style={{ color: "var(--text-secondary)" }}
      >
        You&apos;re currently on{" "}
        <strong style={{ color: "var(--text-primary)" }}>
          {TIER_LABEL[session.tier]}
        </strong>
        . {TIER_LABEL[target]} costs {TIER_PRICE[target]} and unlocks{" "}
        {newFeatures.length} additional capabilities including everything
        below.
      </p>

      {triggerFeature && (
        <div
          className="mb-6 rounded-2xl border p-4 text-sm"
          style={{
            borderColor: "var(--border)",
            background: "var(--accent-subtle)",
            color: "var(--text-primary)",
          }}
        >
          You hit the gate on{" "}
          <code
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: "0.85em",
            }}
          >
            {triggerFeature}
          </code>
          . Upgrading unlocks it immediately.
        </div>
      )}

      <ul className="mb-8 space-y-2">
        {newFeatures.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2 text-sm"
            style={{ color: "var(--text-primary)" }}
          >
            <span style={{ color: "var(--accent)" }}>✓</span>
            <span>{humanizeFeature(feature)}</span>
          </li>
        ))}
      </ul>

      <Link
        href={`${KINETIKS_BILLING_URL}?app=deskof&target=${target}`}
        className="block rounded-full px-5 py-3 text-center text-sm font-semibold"
        style={{
          background: "var(--accent)",
          color: "#ffffff",
        }}
      >
        Upgrade in Kinetiks ID
      </Link>
      <p
        className="mt-3 text-center text-xs"
        style={{ color: "var(--text-tertiary)" }}
      >
        Billing is managed centrally — DeskOf reads your tier from your
        Kinetiks ID account.
      </p>
    </main>
  );
}

function parseTarget(
  raw: string | undefined,
  current: BillingTier
): BillingTier {
  if (raw === "standard" || raw === "hero") return raw;
  return current === "free" ? "standard" : "hero";
}

function isFeature(raw: string | undefined): raw is Feature {
  if (!raw) return false;
  return allFeatures().includes(raw as Feature);
}

function humanizeFeature(feature: Feature): string {
  // Convert feature_snake_case → "Feature snake case"
  const cleaned = feature.replace(/_/g, " ");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
