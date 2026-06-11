"use client";

import { useEffect } from "react";
import { ErrorState, Skeleton } from "@kinetiks/ui";
import { captureException } from "@/lib/observability/sentry";

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
  /** Route path for the Sentry tag, e.g. "/cortex/goals". */
  route: string;
  error: Error & { digest?: string };
  reset: () => void;
}

export function SegmentError({ label, route, error, reset }: SegmentErrorProps) {
  useEffect(() => {
    // Raw detail goes to Sentry with the canonical shape, never the UI.
    void captureException(error, {
      tags: { route, action: "route.render", stage: "render", app: "id" },
      user: {},
      extra: { digest: error.digest },
    });
  }, [error, route]);

  return (
    <ErrorState
      title={`We couldn't load ${label}.`}
      body="This is usually temporary. Try again in a moment."
      onRetry={reset}
    />
  );
}
