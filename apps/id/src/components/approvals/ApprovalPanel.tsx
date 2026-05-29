"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { ApprovalRecord } from "@/lib/approvals/types";
import { ApprovalCard } from "./ApprovalCard";
import { BatchApproveBar } from "./BatchApproveBar";
import { EmptyApprovals } from "./EmptyApprovals";
import { RejectModal } from "./RejectModal";

interface ApprovalPanelProps {
  systemName: string | null;
}

export function ApprovalPanel({ systemName }: ApprovalPanelProps) {
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchLoading, setBatchLoading] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [contraction, setContraction] = useState<string | null>(null);
  const contractionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // After a rejection, the system's autonomy for that action class contracts.
  // Surface that plainly so the customer understands why they'll see more
  // approvals in that category for a while. Reset any in-flight timer so a
  // newer message isn't cleared early by an older one.
  const announceContraction = useCallback((category: string | undefined) => {
    const label = (category ?? "these").replace(/_/g, " ");
    setContraction(`Understood. I'll check with you on ${label} actions until I've re-earned that call.`);
    if (contractionTimer.current) clearTimeout(contractionTimer.current);
    contractionTimer.current = setTimeout(() => setContraction(null), 8000);
  }, []);

  useEffect(() => {
    return () => {
      if (contractionTimer.current) clearTimeout(contractionTimer.current);
    };
  }, []);

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch("/api/approvals/list?status=pending");
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.data?.approvals ?? []);
      }
    } catch {
      // Keep existing state on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();

    // Subscribe to Realtime changes
    const supabase = createBrowserClient();
    const channel = supabase
      .channel("approvals-panel")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "kinetiks_approvals",
        },
        () => {
          // Refetch on any change
          fetchApprovals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchApprovals]);

  const handleApprove = async (id: string, edits?: Record<string, unknown>) => {
    try {
      await fetch("/api/approvals/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approval_id: id,
          action: "approve",
          edits: edits ?? null,
          rejection_reason: null,
        }),
      });
      // Remove from local state immediately
      setApprovals((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // Will be refreshed by Realtime
    }
  };

  const handleReject = async (reason: string) => {
    if (!rejectingId) return;
    const rejected = approvals.find((a) => a.id === rejectingId);

    try {
      await fetch("/api/approvals/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approval_id: rejectingId,
          action: "reject",
          edits: null,
          rejection_reason: reason,
        }),
      });
      setApprovals((prev) => prev.filter((a) => a.id !== rejectingId));
      announceContraction(rejected?.action_category);
    } catch {
      // Will be refreshed by Realtime
    } finally {
      setRejectingId(null);
    }
  };

  /**
   * Phase 4 — Chunk 7: inline-reason reject used by the
   * AuthorityGrantProposalCard (the card captures the reason itself
   * so no RejectModal is opened). Mirrors handleReject without the
   * modal-state plumbing.
   *
   * Gates local-state pruning on res.ok so a 4xx/5xx response does
   * not optimistically hide the approval — the customer sees it
   * still in the queue until Realtime catches up, which surfaces the
   * failure rather than silently swallowing it.
   */
  const rejectWithReason = async (id: string, reason: string) => {
    try {
      const res = await fetch("/api/approvals/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approval_id: id,
          action: "reject",
          edits: null,
          rejection_reason: reason,
        }),
      });
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error(
          `[ApprovalPanel] inline reject failed for ${id}: HTTP ${res.status}`,
        );
        return; // leave the approval in local state; user can retry
      }
      const rejected = approvals.find((a) => a.id === id);
      setApprovals((prev) => prev.filter((a) => a.id !== id));
      announceContraction(rejected?.action_category);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[ApprovalPanel] inline reject network error for ${id}:`,
        err,
      );
    }
  };

  const handleBatchApprove = async () => {
    setBatchLoading(true);
    try {
      await fetch("/api/approvals/batch", { method: "POST" });
      // Remove quick approvals from local state
      setApprovals((prev) => prev.filter((a) => a.approval_type !== "quick"));
    } catch {
      // Will be refreshed by Realtime
    } finally {
      setBatchLoading(false);
    }
  };

  const quickCount = approvals.filter((a) => a.approval_type === "quick").length;

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--kt-fg-3)", fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  if (approvals.length === 0) {
    return <EmptyApprovals />;
  }

  return (
    <div style={{ padding: "var(--kt-s-2)", height: "100%", overflowY: "auto" }}>
      {contraction ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--kt-s-2)",
            padding: "var(--kt-s-2) var(--kt-s-3)",
            marginBottom: "var(--kt-s-2)",
            borderRadius: "var(--kt-radius-1)",
            background: "var(--kt-warning-soft)",
            color: "var(--kt-warning)",
            fontSize: "var(--kt-fs-13)",
          }}
        >
          <span className="kt-status-dot" />
          {contraction}
        </div>
      ) : null}
      <BatchApproveBar
        quickCount={quickCount}
        onBatchApprove={handleBatchApprove}
        loading={batchLoading}
      />
      {approvals.map((approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          onApprove={handleApprove}
          onReject={(id, reason) => {
            // Phase 4 — Chunk 7: authority_grant_proposal cards
            // capture the rejection reason inline, so they pass one
            // through; we POST directly without opening RejectModal.
            // Other approval types still funnel through RejectModal
            // for the reason capture step.
            if (reason !== undefined) {
              void rejectWithReason(id, reason);
              return;
            }
            setRejectingId(id);
          }}
          systemName={systemName}
        />
      ))}
      {rejectingId && (
        <RejectModal
          onReject={handleReject}
          onCancel={() => setRejectingId(null)}
        />
      )}
    </div>
  );
}
