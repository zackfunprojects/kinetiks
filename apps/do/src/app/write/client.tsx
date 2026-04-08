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
  const [refreshNotice, setRefreshNotice] = useState<
    | { kind: "warning"; message: string }
    | { kind: "error"; message: string }
    | null
  >(null);

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
    // Phase 4 — kick the Scout v2 refresh route to compute new
    // opportunities + filtered rows for the user. We care about the
    // HTTP status and the body's { success, warning } payload so
    // real failures surface to the user instead of silently looking
    // like "nothing changed".
    setRefreshNotice(null);
    try {
      const res = await fetch("/api/opportunities/refresh", {
        method: "POST",
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        warning?: string;
      } | null;
      if (!res.ok || !json?.success) {
        setRefreshNotice({
          kind: "error",
          message:
            json?.error ?? `Refresh failed (${res.status}). Try again.`,
        });
      } else if (json.warning) {
        setRefreshNotice({ kind: "warning", message: json.warning });
      }
    } catch (err) {
      setRefreshNotice({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Refresh failed — check your connection.",
      });
    }
    // Still pull fresh data regardless — on success the new rows
    // appear, on failure the existing queue stays visible.
    router.refresh();
  }

  return (
    <div className="relative flex h-full flex-col">
      {refreshNotice && (
        <div
          role={refreshNotice.kind === "error" ? "alert" : "status"}
          className="px-5 py-2 text-xs"
          style={{
            background:
              refreshNotice.kind === "error"
                ? "var(--danger-subtle)"
                : "var(--warning-subtle)",
            color:
              refreshNotice.kind === "error"
                ? "var(--danger)"
                : "var(--warning)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          {refreshNotice.message}
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <CardStack
          opportunities={opportunities}
          angleLocked={angleLocked}
          onSkip={handleSkip}
          onWrite={handleWrite}
          onRefresh={handleRefresh}
        />
      </div>
    </div>
  );
}
