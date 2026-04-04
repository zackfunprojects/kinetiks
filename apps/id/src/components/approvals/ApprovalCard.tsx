"use client";

import type { ApprovalRecord } from "@/lib/approvals/types";
import { QuickApprovalCard } from "./QuickApprovalCard";
import { ReviewApprovalCard } from "./ReviewApprovalCard";
import { StrategicApprovalCard } from "./StrategicApprovalCard";

interface ApprovalCardProps {
  approval: ApprovalRecord;
  onApprove: (id: string, edits?: Record<string, unknown>) => void;
  onReject: (id: string) => void;
  systemName: string | null;
}

export function ApprovalCard({ approval, onApprove, onReject, systemName }: ApprovalCardProps) {
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
