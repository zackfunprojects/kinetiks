import type { CSSProperties } from "react";
import { cn } from "./cn";

export type ConfidenceRingSize = "sm" | "md" | "lg" | "xl" | "hero";

const DIMENSIONS: Record<ConfidenceRingSize, { px: number; strokePx: number; fontSize: string }> = {
  sm: { px: 18, strokePx: 2.5, fontSize: "var(--kt-fs-11)" },
  md: { px: 24, strokePx: 3, fontSize: "var(--kt-fs-12)" },
  lg: { px: 40, strokePx: 4, fontSize: "var(--kt-fs-14)" },
  // C3a — hero sizes for the Cortex Identity surfaces (layer detail,
  // overview centerpiece), so the app-local duplicate could retire.
  xl: { px: 64, strokePx: 6, fontSize: "var(--kt-fs-17)" },
  hero: { px: 96, strokePx: 8, fontSize: "var(--kt-fs-24)" },
};

export type ConfidenceRingTone = "auto" | "accent" | "success" | "warning" | "danger";

const TONE_STROKE: Record<Exclude<ConfidenceRingTone, "auto">, string> = {
  accent: "var(--kt-accent)",
  success: "var(--kt-success)",
  warning: "var(--kt-warning)",
  danger: "var(--kt-danger)",
};

export interface ConfidenceRingProps {
  /** 0..1 confidence. Values outside are clamped. */
  value: number;
  /** Threshold above which the ring fills with the accent token; default 0.6. */
  threshold?: number;
  size?: ConfidenceRingSize;
  ariaLabel?: string;
  showLabel?: boolean;
  /**
   * Fill tone. "auto" (default) fills accent at/above threshold, neutral below
   * — the earned-autonomy signal. Pass an explicit tone (e.g. "warning") to
   * show the trust-re-earning state after a rejection.
   */
  tone?: ConfidenceRingTone;
  /** Render a small tick at the threshold position on the track. */
  showThresholdTick?: boolean;
  className?: string;
}

export function ConfidenceRing({
  value,
  threshold = 0.6,
  size = "md",
  ariaLabel,
  showLabel = false,
  tone = "auto",
  showThresholdTick = false,
  className,
}: ConfidenceRingProps) {
  const clamped = Math.min(1, Math.max(0, value));
  // Clamp once and reuse for both the fill-color comparison and the tick math.
  const clampedThreshold = Math.min(1, Math.max(0, threshold));
  const { px, strokePx, fontSize } = DIMENSIONS[size];
  const radius = (px - strokePx) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - clamped * circumference;
  const stroke =
    tone === "auto"
      ? clamped >= clampedThreshold
        ? "var(--kt-accent)"
        : "var(--kt-fg-3)"
      : TONE_STROKE[tone];
  const label = Math.round(clamped * 100);

  // Threshold tick: a dot on the track at the threshold angle (track starts at
  // 12 o'clock and runs clockwise, matching the progress arc's -90° rotation).
  const tickAngle = (-90 + clampedThreshold * 360) * (Math.PI / 180);
  const tickX = px / 2 + radius * Math.cos(tickAngle);
  const tickY = px / 2 + radius * Math.sin(tickAngle);

  const wrap: CSSProperties = {
    position: "relative",
    width: px,
    height: px,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <span
      className={cn(className)}
      style={wrap}
      role="img"
      aria-label={ariaLabel ?? `Confidence ${label}%`}
    >
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} aria-hidden>
        <circle
          cx={px / 2}
          cy={px / 2}
          r={radius}
          stroke="var(--kt-border-2)"
          strokeWidth={strokePx}
          fill="none"
        />
        <circle
          cx={px / 2}
          cy={px / 2}
          r={radius}
          stroke={stroke}
          strokeWidth={strokePx}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${px / 2} ${px / 2})`}
          style={{ transition: "stroke-dashoffset var(--kt-dur-2) var(--kt-ease-standard)" }}
        />
        {showThresholdTick ? (
          <circle cx={tickX} cy={tickY} r={Math.max(1.5, strokePx * 0.7)} fill="var(--kt-fg-2)" />
        ) : null}
      </svg>
      {showLabel ? (
        <span
          className="kt-mono"
          style={{
            position: "absolute",
            fontSize,
            color: "var(--kt-fg-1)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
