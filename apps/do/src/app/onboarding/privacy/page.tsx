"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PrivacyDisclosureModal } from "@/components/privacy/PrivacyDisclosureModal";
import { track } from "@/lib/analytics";

/**
 * Onboarding step 1 (privacy half).
 *
 * Shows the privacy disclosure modal. On acknowledge, POSTs to
 * /api/onboarding/privacy and routes to the next step. The Reddit/Quora
 * connection screen is the second half of step 1 and lands as a
 * follow-up PR once Reddit Data API access is approved.
 */
export default function PrivacyStepPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    track({ name: "onboarding_started", props: { source: "organic" } });
  }, []);

  async function handleAcknowledge(version: string) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/privacy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version }),
      });
      if (!res.ok) throw new Error("privacy submit failed");
      router.push("/onboarding/connect");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitting) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p style={{ color: "var(--text-tertiary)" }}>Saving...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <PrivacyDisclosureModal onAcknowledge={handleAcknowledge} />
    </main>
  );
}
