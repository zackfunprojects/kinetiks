"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TrackLevel, BillingTier } from "@kinetiks/deskof";
import { TrackSelector } from "@/components/onboarding/TrackSelector";

/**
 * Onboarding step 5 — track selection.
 *
 * Default = Standard with 7-day free trial (Final Supplement #4 step 5).
 * After selection the user lands on the Write tab with their first
 * opportunity card.
 */
export default function TrackStepPage() {
  const router = useRouter();
  const [tier, setTier] = useState<BillingTier | null>(null);

  useEffect(() => {
    void fetch("/api/account/me")
      .then((r) => r.json())
      .then((j) => setTier(j.tier ?? "free"))
      .catch(() => setTier("free"));
  }, []);

  async function handleSelect(level: TrackLevel) {
    const res = await fetch("/api/onboarding/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ track: level }),
    });
    if (!res.ok) throw new Error("track submit failed");
    router.push("/write");
  }

  if (!tier) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p style={{ color: "var(--text-tertiary)" }}>Loading...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <TrackSelector tier={tier} onSelect={handleSelect} />
    </main>
  );
}
