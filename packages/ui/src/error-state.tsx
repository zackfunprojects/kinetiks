import type { ReactNode } from "react";
import { Button } from "./button";
import { cn } from "./cn";

export interface ErrorStateProps {
  /** User-safe title. Never interpolate raw error messages here. */
  title?: ReactNode;
  body?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * The standard failure state for an async view. Shows a friendly, actionable
 * message and an optional retry. Raw error detail belongs in Sentry, never here.
 */
export function ErrorState({
  title = "Something went wrong.",
  body,
  onRetry,
  retryLabel = "Try again",
  className,
}: ErrorStateProps) {
  return (
    <div className={cn("kt-empty", className)} role="alert">
      <div className="kt-empty__title">{title}</div>
      {body ? <div className="kt-empty__body">{body}</div> : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
