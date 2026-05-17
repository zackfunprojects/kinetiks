import type { ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  title: ReactNode;
  body?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, body, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn("kt-empty", className)}>
      {icon ? <div aria-hidden>{icon}</div> : null}
      <div className="kt-empty__title">{title}</div>
      {body ? <div className="kt-empty__body">{body}</div> : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}
