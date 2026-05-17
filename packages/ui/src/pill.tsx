import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

export type PillTone = "neutral" | "accent" | "success" | "warning" | "danger" | "warm";

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const TONE_CLASS: Record<PillTone, string> = {
  neutral: "",
  accent: "kt-pill--accent",
  success: "kt-pill--success",
  warning: "kt-pill--warning",
  danger: "kt-pill--danger",
  warm: "kt-pill--warm",
};

export const Pill = forwardRef<HTMLSpanElement, PillProps>(function Pill(
  { tone = "neutral", leftIcon, rightIcon, className, children, ...rest },
  ref,
) {
  return (
    <span ref={ref} className={cn("kt-pill", TONE_CLASS[tone], className)} {...rest}>
      {leftIcon ? <span aria-hidden>{leftIcon}</span> : null}
      <span>{children}</span>
      {rightIcon ? <span aria-hidden>{rightIcon}</span> : null}
    </span>
  );
});
