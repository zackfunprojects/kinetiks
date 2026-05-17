import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "./cn";

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
}

export function Skeleton({ width, height, radius, className, style, ...rest }: SkeletonProps) {
  const css: CSSProperties = {
    width,
    height,
    borderRadius: radius,
    ...style,
  };
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className={cn("kt-skeleton", className)}
      style={css}
      {...rest}
    />
  );
}
