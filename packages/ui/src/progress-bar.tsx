import type { CSSProperties } from "react";
import { fractionToPercent } from "@kinetiks/lib/chart-math";
import { cn } from "./cn";

export type ProgressTone = "accent" | "success" | "warning" | "danger" | "neutral";

const TONE_COLOR: Record<ProgressTone, string> = {
  accent: "var(--kt-accent)",
  success: "var(--kt-success)",
  warning: "var(--kt-warning)",
  danger: "var(--kt-danger)",
  neutral: "var(--kt-fg-3)",
};

export interface ProgressBarProps {
  /** 0..1 completion. Values outside are clamped. */
  value: number;
  tone?: ProgressTone;
  height?: number;
  /** Optional 0..1 marker for pace/threshold (e.g. "where you should be today"). */
  tickAt?: number;
  ariaLabel?: string;
  className?: string;
}

/** A token-driven progress track with an optional pace/threshold tick. */
export function ProgressBar({
  value,
  tone = "accent",
  height = 6,
  tickAt,
  ariaLabel,
  className,
}: ProgressBarProps) {
  const pct = fractionToPercent(value);
  const trackStyle: CSSProperties = { height };
  return (
    <div
      className={cn("kt-progress", className)}
      style={trackStyle}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={ariaLabel ?? `${Math.round(pct)} percent complete`}
    >
      <div className="kt-progress__fill" style={{ width: `${pct}%`, backgroundColor: TONE_COLOR[tone] }} />
      {tickAt !== undefined ? (
        <div className="kt-progress__tick" style={{ left: `${fractionToPercent(tickAt)}%` }} aria-hidden />
      ) : null}
    </div>
  );
}
