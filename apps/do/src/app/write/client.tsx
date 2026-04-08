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
 *
 * Optimistic skip semantics: we maintain a Set of locally-skipped
 * IDs and derive the visible queue from `initialOpportunities` minus
 * that set. On API failure we remove the failed ID from the set, so
 * earlier-successful skips stay skipped.
 */
export function WriteTabClient({
  initialOpportunities,
  angleLocked,
}: Props) {
  const router = useRouter();
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());

  const opportunities = initialOpportunities.filter(
    (o) => !skippedIds.has(o.id)
  );

  async function handleSkip(
    opportunityId: string,
    reason: SkipReason
  ): Promise<{ ok: boolean }> {
    // Optimistic removal
    setSkippedIds((prev) => {
      const next = new Set(prev);
      next.add(opportunityId);
      return next;
    });

    try {
      const res = await fetch("/api/opportunities/skip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunity_id: opportunityId, reason }),
      });
      if (!res.ok) throw new Error(`skip failed: ${res.status}`);
      return { ok: true };
    } catch {
      // Revert ONLY the failing ID — earlier successful skips stay skipped.
      setSkippedIds((prev) => {
        const next = new Set(prev);
        next.delete(opportunityId);
        return next;
      });
      return { ok: false };
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
