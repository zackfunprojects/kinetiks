import type { CSSProperties } from "react";
import { cn } from "./cn";

export type ConfidenceRingSize = "sm" | "md" | "lg";

const DIMENSIONS: Record<ConfidenceRingSize, { px: number; strokePx: number; fontSize: string }> = {
  sm: { px: 18, strokePx: 2.5, fontSize: "var(--kt-fs-11)" },
  md: { px: 24, strokePx: 3, fontSize: "var(--kt-fs-12)" },
  lg: { px: 40, strokePx: 4, fontSize: "var(--kt-fs-14)" },
};

export interface ConfidenceRingProps {
  /** 0..1 confidence. Values outside are clamped. */
  value: number;
  /** Threshold above which the ring fills with the accent token; default 0.6. */
  threshold?: number;
  size?: ConfidenceRingSize;
  ariaLabel?: string;
  showLabel?: boolean;
  className?: string;
}

export function ConfidenceRing({
  value,
  threshold = 0.6,
  size = "md",
  ariaLabel,
  showLabel = false,
  className,
}: ConfidenceRingProps) {
  const clamped = Math.min(1, Math.max(0, value));
  const { px, strokePx, fontSize } = DIMENSIONS[size];
  const radius = (px - strokePx) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - clamped * circumference;
  const stroke = clamped >= threshold ? "var(--kt-accent)" : "var(--kt-fg-3)";
  const label = Math.round(clamped * 100);

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
