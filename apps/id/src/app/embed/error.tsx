"use client";

import { Button } from "@kinetiks/ui";

export default function EmbedError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div
      role="alert"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--kt-s-3)",
        color: "var(--kt-fg-2)",
        fontSize: "var(--kt-fs-14)",
      }}
    >
      <span>This workspace surface couldn&apos;t load.</span>
      <Button variant="secondary" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
