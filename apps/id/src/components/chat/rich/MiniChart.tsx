"use client";

import { Sparkline, MiniBars } from "@kinetiks/ui";

export interface MiniChartProps {
  chart: "sparkline" | "bars";
  values: number[];
  label?: string;
}

/**
 * An inline mini-chart for analytics answers (spec-addendum-chat-ux §B.5
 * "Mini-charts"). Wraps the shared @kinetiks/ui chart primitives.
 */
export function MiniChart({ chart, values, label }: MiniChartProps) {
  return (
    <div
      style={{
        marginTop: "var(--kt-s-3)",
        display: "flex",
        alignItems: "center",
        gap: "var(--kt-s-3)",
      }}
    >
      {chart === "sparkline" ? (
        <Sparkline values={values} showEndDot ariaLabel={label ?? "trend"} />
      ) : (
        <MiniBars values={values} ariaLabel={label ?? "bars"} />
      )}
      {label && (
        <span
          className="kt-data-inline"
          style={{ color: "var(--kt-fg-3)", fontSize: "var(--kt-fs-12)" }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
