import { useMemo, type CSSProperties, type HTMLAttributes } from "react";
import { cn } from "./cn";

export type AvatarSize = "sm" | "md" | "lg";

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  name: string;
  src?: string;
  size?: AvatarSize;
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, src, size = "md", className, ...rest }: AvatarProps) {
  const initials = useMemo(() => initialsFrom(name), [name]);
  const style: CSSProperties | undefined = src ? undefined : { textTransform: "uppercase" };
  return (
    <span
      className={cn("kt-avatar", `kt-avatar--${size}`, className)}
      style={style}
      aria-label={name}
      {...rest}
    >
      {src ? <img src={src} alt={name} /> : initials}
    </span>
  );
}
