"use client";

import { useEffect } from "react";
import { ErrorState } from "@kinetiks/ui";

/**
 * Route error boundary for the chat thread page. The loader's spine queries
 * (ownership check, threads, messages) now throw on DB failure rather than
 * silently degrading, so those failures surface here instead of a blank or
 * misleading redirect. Raw detail goes to the console/Sentry, never the UI.
 */
export default function ChatThreadError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[chat/thread] route error:", error);
  }, [error]);

  return (
    <ErrorState
      title="This conversation couldn't be loaded."
      body="This is usually temporary. Try again, or head back to your chats."
      onRetry={reset}
    />
  );
}
