"use client";

import { Button } from "./button";

export interface BulkAction {
  label: string;
  onClick: () => void;
  /** Renders as red text, no fill (§16.5 destructive treatment). */
  destructive?: boolean;
}

export interface BulkActionBarProps {
  /** Number of selected entities. */
  count: number;
  /** Total selectable — enables the "Select all N" link. */
  total?: number;
  onSelectAll?: () => void;
  /** The persistent-bar dismiss (X on the left, §16.5). */
  onClear: () => void;
  actions: BulkAction[];
}

/**
 * The bulk selection action bar (spec §16.4): a floating bar at the top of the
 * app panel when multiple entities are selected — by the user or by the system
 * during orchestration. Selection count + "Select all" on the left; contextual
 * actions on the right. Persistent bar → dismiss (X) on the LEFT (§16.5).
 */
export function BulkActionBar({
  count,
  total,
  onSelectAll,
  onClear,
  actions,
}: BulkActionBarProps) {
  return (
    <div className="kt-floating-bar" role="toolbar" aria-label={`${count} selected`}>
      <Button variant="ghost" size="sm" onClick={onClear} aria-label="Clear selection">
        ×
      </Button>
      <span className="kt-floating-bar__body" style={{ fontSize: "var(--kt-fs-13)", color: "var(--kt-fg-1)" }}>
        {count} selected
        {total && total > count && onSelectAll ? (
          <>
            {" · "}
            <button
              type="button"
              onClick={onSelectAll}
              className="kt-btn kt-btn--ghost kt-btn--sm"
              style={{ height: "auto", padding: 0, color: "var(--kt-accent)" }}
            >
              Select all {total}
            </button>
          </>
        ) : null}
      </span>
      <span className="kt-floating-bar__actions">
        {actions.map((a) => (
          <Button
            key={a.label}
            variant={a.destructive ? "danger" : "secondary"}
            size="sm"
            onClick={a.onClick}
          >
            {a.label}
          </Button>
        ))}
      </span>
    </div>
  );
}
