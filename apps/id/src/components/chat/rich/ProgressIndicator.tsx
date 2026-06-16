"use client";

import { ProgressBar } from "@kinetiks/ui";

export interface ProgressIndicatorProps {
  label: string;
  /** 0..100. */
  progress: number;
  step?: string;
}

/**
 * Live progress while the system does work (spec-addendum-chat-ux §B.5
 * "Progress indicators"): "Finding prospects... Drafting email 1 of 3...".
 * Fed by `command_progress` SSE events.
 */
export function ProgressIndicator({ label, progress, step }: ProgressIndicatorProps) {
  const clamped = Math.max(0, Math.min(100, progress));
  return (
    <div
      style={{ marginTop: "var(--kt-s-3)" }}
      aria-busy={clamped < 100}
      aria-live="polite"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "var(--kt-s-2)",
          marginBottom: "var(--kt-s-1)",
        }}
      >
        <span style={{ fontSize: "var(--kt-fs-13)", color: "var(--kt-fg-2)" }}>
          {step ?? label}
        </span>
        <span
          className="kt-data-inline"
          style={{ fontSize: "var(--kt-fs-11)", color: "var(--kt-fg-3)" }}
        >
          {clamped}%
        </span>
      </div>
      <ProgressBar value={clamped / 100} ariaLabel={label} />
    </div>
  );
}
