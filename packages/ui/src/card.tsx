import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

export type CardVariant = "default" | "muted" | "accent" | "bare";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  children?: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = "default", className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn("kt-card", variant !== "default" ? `kt-card--${variant}` : "", className)}
      {...rest}
    >
      {children}
    </div>
  );
});
