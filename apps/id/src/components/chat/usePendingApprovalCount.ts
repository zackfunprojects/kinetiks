"use client";

/**
 * D4 — the pending-approval count for the sidebar badge.
 *
 * The SidebarToggle has accepted an approvalCount since B-phase but
 * nothing ever fed it (audit 2.4: "the approval badge is built but
 * never fed"). Fetches once, then refreshes on the same Realtime
 * signal the ApprovalPanel uses; RLS scopes the subscription rows.
 */

import { useEffect, useState } from "react";

import { createClient as createBrowserClient } from "@/lib/supabase/client";

export function usePendingApprovalCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/approvals/list?status=pending");
        if (!res.ok) return;
        const json = (await res.json()) as {
          data?: { approvals?: unknown[] };
          approvals?: unknown[];
        };
        const approvals = json.data?.approvals ?? json.approvals ?? [];
        if (!cancelled) setCount(Array.isArray(approvals) ? approvals.length : 0);
      } catch {
        // Side-panel read: a failed count renders no badge, never an error.
      }
    }

    void load();

    const supabase = createBrowserClient();
    const channel = supabase
      .channel("approvals-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kinetiks_approvals" },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  return count;
}
