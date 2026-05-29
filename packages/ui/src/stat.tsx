import type { ReactNode } from "react";
import { cn } from "./cn";

export interface StatProps {
  /** Eyebrow label above the value. */
  label: ReactNode;
  /** The number/value. Rendered in the mono data type role. */
  value: ReactNode;
  /** Optional supporting line below (trend, target, etc.). */
  sub?: ReactNode;
  size?: "lg" | "sm";
  className?: string;
}

/**
 * A labeled metric. Pairs the eyebrow type role with the mono data role so
 * numbers are always tabular and consistent across surfaces.
 */
export function Stat({ label, value, sub, size = "lg", className }: StatProps) {
  return (
    <div className={cn(className)}>
      <div className="kt-eyebrow">{label}</div>
      <div className={size === "lg" ? "kt-data-large" : "kt-data-cell"}>{value}</div>
      {sub ? <div className="kt-small">{sub}</div> : null}
    </div>
  );
}
