import type { ReactNode } from "react";
import { Pill, type PillTone } from "./pill";
import { cn } from "./cn";

export interface StatusPillProps {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}

/**
 * A status chip that always pairs a color with a text label (WCAG: status is
 * never conveyed by color alone). The leading dot is decorative; the label
 * carries the meaning.
 */
export function StatusPill({ tone = "neutral", children, className }: StatusPillProps) {
  return (
    <Pill tone={tone} className={cn(className)} leftIcon={<span className="kt-status-dot" />}>
      {children}
    </Pill>
  );
}
