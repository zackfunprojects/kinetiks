"use client";

import { useEffect } from "react";
import { ErrorState } from "@kinetiks/ui";
import { captureException } from "@/lib/observability/sentry";

/**
 * Route error boundary for the chat thread page. The loader's spine queries
 * (ownership check, threads, messages) now throw on DB failure rather than
 * silently degrading, so those failures surface here instead of a blank or
 * misleading redirect. Raw detail goes to Sentry, never the UI.
 */
export default function ChatThreadError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void captureException(error, {
      tags: { route: "/chat/[threadId]", action: "route.render", stage: "render", app: "id" },
      user: {},
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <ErrorState
      title="This conversation couldn't be loaded."
      body="This is usually temporary. Try again, or head back to your chats."
      onRetry={reset}
    />
  );
}
