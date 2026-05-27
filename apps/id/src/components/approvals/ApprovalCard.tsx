"use client";

import type { ApprovalRecord } from "@/lib/approvals/types";
import { AuthorityGrantProposalCard } from "./AuthorityGrantProposalCard";
import { QuickApprovalCard } from "./QuickApprovalCard";
import { ReviewApprovalCard } from "./ReviewApprovalCard";
import { StrategicApprovalCard } from "./StrategicApprovalCard";

interface ApprovalCardProps {
  approval: ApprovalRecord;
  onApprove: (id: string, edits?: Record<string, unknown>) => void;
  /**
   * Optional reason — only authority_grant_proposal rejects pass one
   * today; other approval types still use the existing rejection
   * modal flow that calls onReject(id) without a reason here.
   */
  onReject: (id: string, reason?: string) => void;
  systemName: string | null;
}

export function ApprovalCard({ approval, onApprove, onReject, systemName }: ApprovalCardProps) {
  // Phase 4 — Chunk 7: authority_grant_proposal is the only approval
  // class today that requires its own card. Customer-facing copy uses
  // "permission" framing — never "Authority Grant".
  const approvalClass = (
    approval as ApprovalRecord & { approval_class?: string }
  ).approval_class;
  if (approvalClass === "authority_grant_proposal") {
    return (
      <AuthorityGrantProposalCard
        approval={approval}
        onApprove={onApprove}
        onReject={(id, reason) => onReject(id, reason)}
        systemName={systemName}
      />
    );
  }

  switch (approval.approval_type) {
    case "quick":
      return (
        <QuickApprovalCard
          approval={approval}
          onApprove={onApprove}
          onReject={onReject}
        />
      );
    case "strategic":
      return (
        <StrategicApprovalCard
          approval={approval}
          onApprove={onApprove}
          onReject={onReject}
          systemName={systemName}
        />
      );
    case "review":
    default:
      return (
        <ReviewApprovalCard
          approval={approval}
          onApprove={onApprove}
          onReject={onReject}
        />
      );
  }
}
