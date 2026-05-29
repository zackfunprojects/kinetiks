import type { ReactNode } from "react";
import { Skeleton } from "./skeleton";
import { ErrorState } from "./error-state";
import { EmptyState } from "./empty-state";

export interface AsyncSectionProps {
  loading: boolean;
  /** Truthy when the fetch failed. The raw value is never rendered. */
  error?: unknown;
  isEmpty?: boolean;
  onRetry?: () => void;
  loadingFallback?: ReactNode;
  errorFallback?: ReactNode;
  emptyFallback?: ReactNode;
  /** User-safe error title used by the default error fallback. */
  errorTitle?: ReactNode;
  /** Empty title used by the default empty fallback (omit to render nothing). */
  emptyTitle?: ReactNode;
  children: ReactNode;
}

/**
 * Renders the loading / error / empty / content states for an async view in
 * one place, so every list and panel handles all four consistently. Pass
 * custom fallbacks to override the defaults (Skeleton / ErrorState / EmptyState).
 */
export function AsyncSection({
  loading,
  error,
  isEmpty = false,
  onRetry,
  loadingFallback,
  errorFallback,
  emptyFallback,
  errorTitle,
  emptyTitle,
  children,
}: AsyncSectionProps) {
  if (loading) return <>{loadingFallback ?? <Skeleton height={64} />}</>;
  if (error) return <>{errorFallback ?? <ErrorState title={errorTitle} onRetry={onRetry} />}</>;
  if (isEmpty) {
    if (emptyFallback) return <>{emptyFallback}</>;
    return emptyTitle ? <EmptyState title={emptyTitle} /> : null;
  }
  return <>{children}</>;
}
