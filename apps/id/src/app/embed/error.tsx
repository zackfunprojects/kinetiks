"use client";

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
      <button
        onClick={reset}
        style={{
          background: "none",
          border: "1px solid var(--kt-border-2)",
          borderRadius: "var(--kt-radius-1)",
          padding: "var(--kt-s-1) var(--kt-s-3)",
          color: "var(--kt-fg-1)",
          cursor: "pointer",
          fontSize: "var(--kt-fs-13)",
        }}
      >
        Try again
      </button>
    </div>
  );
}
