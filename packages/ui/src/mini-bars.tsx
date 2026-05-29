import { barRects } from "@kinetiks/lib/chart-math";
import { cn } from "./cn";

export interface MiniBarsProps {
  values: number[];
  width?: number;
  height?: number;
  gap?: number;
  /** Any --kt-* color token reference. Defaults to the accent token. */
  color?: string;
  /** Index to emphasize (e.g. the winning variant); others render muted. */
  highlightIndex?: number;
  ariaLabel?: string;
  className?: string;
}

/** A compact bar series, e.g. per-variant evidence on an insight card. */
export function MiniBars({
  values,
  width = 88,
  height = 32,
  gap = 3,
  color = "var(--kt-accent)",
  highlightIndex,
  ariaLabel,
  className,
}: MiniBarsProps) {
  const rects = barRects(values, width, height, gap, 1);
  return (
    <svg
      className={cn(className)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? "Distribution"}
    >
      {rects.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.width}
          height={r.height}
          rx={1}
          fill={highlightIndex === undefined || highlightIndex === i ? color : "var(--kt-border-2)"}
        />
      ))}
    </svg>
  );
}
