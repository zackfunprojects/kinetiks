import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type BadgeVariant = "default" | "success" | "warning" | "error" | "accent";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  label: string;
  variant?: BadgeVariant;
}

/**
 * Small mono status label. Styling lives in kinetiks-tokens.css
 * (.kt-badge + variants) per the shared-primitive pattern. Status is
 * always conveyed by the label text, never color alone (WCAG).
 */
export function Badge({ label, variant = "default", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn("kt-badge", variant !== "default" ? `kt-badge--${variant}` : "", className)}
      {...rest}
    >
      {label}
    </span>
  );
}
