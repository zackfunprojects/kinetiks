"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Opportunity, SkipReason } from "@kinetiks/deskof";
import { CardStack } from "@/components/write/CardStack";

interface Props {
  initialOpportunities: Opportunity[];
  angleLocked: boolean;
}

/**
 * Client wrapper for the Write tab. Owns the optimistic queue state,
 * forwards skip + write events to the API routes, and routes the user
 * to the reply editor on accept.
 */
export function WriteTabClient({
  initialOpportunities,
  angleLocked,
}: Props) {
  const router = useRouter();
  const [opportunities, setOpportunities] = useState(initialOpportunities);

  async function handleSkip(opportunityId: string, reason: SkipReason) {
    // Optimistic removal
    setOpportunities((prev) => prev.filter((o) => o.id !== opportunityId));

    try {
      const res = await fetch("/api/opportunities/skip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunity_id: opportunityId, reason }),
      });
      if (!res.ok) throw new Error(`skip failed: ${res.status}`);
    } catch {
      // Revert optimistic removal on failure
      setOpportunities(initialOpportunities);
    }
  }

  function handleWrite(opportunityId: string) {
    router.push(`/write/${opportunityId}`);
  }

  async function handleRefresh() {
    router.refresh();
  }

  return (
    <CardStack
      opportunities={opportunities}
      angleLocked={angleLocked}
      onSkip={handleSkip}
      onWrite={handleWrite}
      onRefresh={handleRefresh}
    />
  );
}
