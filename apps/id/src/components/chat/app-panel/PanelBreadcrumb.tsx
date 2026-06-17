"use client";

import { Button } from "@kinetiks/ui";
import type { PanelStep } from "./AppPanelContext";

export interface PanelBreadcrumbProps {
  steps: PanelStep[];
  /** The app currently shown in the panel. */
  current: string;
  onSelect: (step: PanelStep) => void;
  showBoth: boolean;
  onToggleBoth: () => void;
  /** Whether the side-by-side toggle is offered (wide viewports only). */
  canShowBoth: boolean;
}

const STATUS_MARK: Record<PanelStep["status"], string> = {
  done: "✓",
  active: "●",
  queued: "○",
};

/**
 * Orchestration breadcrumb for a multi-app command (spec §10.4):
 * `[Dark Madder ✓] > [Harvest ●] > [Litmus ○]`. Click any step to view its
 * app even after the system has moved on; toggle side-by-side on wide viewports.
 */
export function PanelBreadcrumb({
  steps,
  current,
  onSelect,
  showBoth,
  onToggleBoth,
  canShowBoth,
}: PanelBreadcrumbProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--kt-s-1)", minWidth: 0, flex: 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--kt-s-1)",
          overflow: "hidden",
          flex: 1,
        }}
      >
        {steps.map((step, i) => (
          <span key={`${step.app}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: "var(--kt-s-1)" }}>
            {i > 0 && <span style={{ color: "var(--kt-fg-4)" }}>›</span>}
            <Button
              variant={step.app === current ? "accent" : "ghost"}
              size="sm"
              aria-current={step.app === current ? "true" : undefined}
              onClick={() => onSelect(step)}
            >
              <span style={{ textTransform: "capitalize" }}>{step.app}</span>{" "}
              <span aria-hidden style={{ opacity: 0.7 }}>{STATUS_MARK[step.status]}</span>
            </Button>
          </span>
        ))}
      </div>
      {canShowBoth && (
        <Button variant="ghost" size="sm" aria-pressed={showBoth} onClick={onToggleBoth}>
          {showBoth ? "Single" : "Show both"}
        </Button>
      )}
    </div>
  );
}
