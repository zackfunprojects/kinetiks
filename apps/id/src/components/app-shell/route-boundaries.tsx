"use client";

import { useEffect } from "react";
import { ErrorState, Skeleton } from "@kinetiks/ui";

/**
 * C3b — shared internals for per-segment loading.tsx / error.tsx files.
 * Next.js requires the files per segment; these keep rendering and
 * reporting consistent (pattern from chat/[threadId]'s boundaries).
 */

export function SegmentLoading({ label }: { label: string }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      aria-label={`Loading ${label}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--kt-s-3)",
        padding: "var(--kt-s-6)",
        maxWidth: 920,
        margin: "0 auto",
      }}
    >
      <Skeleton height={18} width="35%" />
      <Skeleton height={56} width="100%" />
      <Skeleton height={56} width="82%" />
      <Skeleton height={56} width="90%" />
    </div>
  );
}

interface SegmentErrorProps {
  /** Customer-facing surface name, e.g. "your goals". */
  label: string;
  error: Error & { digest?: string };
  reset: () => void;
}

export function SegmentError({ label, error, reset }: SegmentErrorProps) {
  useEffect(() => {
    // Raw detail goes to the console/Sentry, never the UI (same
    // contract as the chat thread boundary).
    // eslint-disable-next-line no-console
    console.error(`[route:${label}] boundary error:`, error);
  }, [error, label]);

  return (
    <ErrorState
      title={`We couldn't load ${label}.`}
      body="This is usually temporary. Try again in a moment."
      onRetry={reset}
    />
  );
}
