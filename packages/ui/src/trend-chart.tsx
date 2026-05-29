"use client";

import { useId } from "react";
import { trendPaths, toPoints } from "@kinetiks/lib/chart-math";
import { cn } from "./cn";

export interface TrendChartProps {
  values: number[];
  width?: number;
  height?: number;
  /** Any --kt-* color token reference. Defaults to the accent token. */
  color?: string;
  strokeWidth?: number;
  /** Fill the area under the line with a faint wash of `color`. */
  showArea?: boolean;
  /** Draw a baseline rule along the bottom. */
  showBaseline?: boolean;
  ariaLabel?: string;
  className?: string;
}

/**
 * A small line/area chart for metric trends over a window. Stretches to its
 * container width via `preserveAspectRatio="none"`; geometry from
 * `@kinetiks/lib/chart-math`.
 */
export function TrendChart({
  values,
  width = 320,
  height = 96,
  color = "var(--kt-accent)",
  strokeWidth = 2,
  showArea = true,
  showBaseline = true,
  ariaLabel,
  className,
}: TrendChartProps) {
  const pad = strokeWidth + 2;
  const { line, area } = trendPaths(values, width, height, pad);
  const end = toPoints(values, width, height, pad).at(-1);
  // useId is SSR-safe and unique per instance, so multiple same-size charts
  // don't collide on the gradient id. Strip colons React may include.
  const gradientId = `kt-trend-fade-${useId().replace(/:/g, "")}`;

  return (
    <svg
      className={cn(className)}
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? "Trend over time"}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {showBaseline ? (
        <line
          x1={pad}
          y1={height - pad}
          x2={width - pad}
          y2={height - pad}
          stroke="var(--kt-border-1)"
          strokeWidth={1}
        />
      ) : null}
      {showArea && area ? <path d={area} fill={`url(#${gradientId})`} stroke="none" /> : null}
      {line ? (
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {end ? <circle cx={end.x} cy={end.y} r={strokeWidth + 1} fill={color} /> : null}
    </svg>
  );
}
