import { sparklinePoints, toPoints } from "@kinetiks/lib/chart-math";
import { cn } from "./cn";

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** Any --kt-* color token reference. Defaults to the accent token. */
  color?: string;
  strokeWidth?: number;
  /** Render a dot at the latest point. */
  showEndDot?: boolean;
  ariaLabel?: string;
  className?: string;
}

/**
 * A compact trend line. Dependency-free SVG; all geometry comes from
 * `@kinetiks/lib/chart-math` so it matches the other chart primitives.
 */
export function Sparkline({
  values,
  width = 88,
  height = 24,
  color = "var(--kt-accent)",
  strokeWidth = 1.5,
  showEndDot = false,
  ariaLabel,
  className,
}: SparklineProps) {
  const pad = strokeWidth + 1;
  const points = sparklinePoints(values, width, height, pad);
  const end = showEndDot ? toPoints(values, width, height, pad).at(-1) : undefined;

  return (
    <svg
      className={cn(className)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? "Trend"}
      preserveAspectRatio="none"
    >
      {points ? (
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {end ? <circle cx={end.x} cy={end.y} r={strokeWidth + 0.5} fill={color} /> : null}
    </svg>
  );
}
