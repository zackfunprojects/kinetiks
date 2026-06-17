"use client";

import { Badge } from "./badge";
import { Button } from "./button";

export interface ApprovalOverlayBarProps {
  /** Plain-language summary of what's being approved (§9.1). */
  summary: string;
  /** When true, Approve becomes "Save & approve" and Edit is hidden. */
  editing?: boolean;
  pending?: boolean;
  /** Approve (or, while editing, save the edits and approve). */
  onApprove: () => void;
  /** Toggle edit-in-place. */
  onEdit: () => void;
  /** Reject with a reason. */
  onReject: () => void;
  fixture?: boolean;
}

/**
 * The in-panel visual approval bar (spec §9.1 / §16.6): a floating bar at the
 * bottom of the app panel. Approve is the dark-filled primary; Reject is red
 * text (no fill); Edit is secondary. Token-only; light + dark.
 */
export function ApprovalOverlayBar({
  summary,
  editing = false,
  pending = false,
  onApprove,
  onEdit,
  onReject,
  fixture = false,
}: ApprovalOverlayBarProps) {
  return (
    <div className="kt-floating-bar" role="group" aria-label="Approve this action">
      <span className="kt-floating-bar__body" style={{ fontSize: "var(--kt-fs-13)", color: "var(--kt-fg-1)" }}>
        {summary}
        {fixture ? (
          <>
            {" "}
            <Badge label="fixture" variant="warning" />
          </>
        ) : null}
      </span>
      <span className="kt-floating-bar__actions">
        <Button variant="danger" size="sm" onClick={onReject} disabled={pending}>
          Reject
        </Button>
        {!editing ? (
          <Button variant="secondary" size="sm" onClick={onEdit} disabled={pending}>
            Edit
          </Button>
        ) : null}
        <Button variant="primary" size="sm" onClick={onApprove} disabled={pending}>
          {editing ? "Save & approve" : "Approve"}
        </Button>
      </span>
    </div>
  );
}
