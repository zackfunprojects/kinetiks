"use client";

export function InsightSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading insights"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            border: "1px solid var(--kt-border-1)",
            borderRadius: "var(--kt-radius-2, 8px)",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            background: "var(--kt-bg-1)",
          }}
        >
          <div
            style={{
              width: 60,
              height: 14,
              background: "var(--kt-bg-2)",
              borderRadius: 4,
            }}
          />
          <div
            style={{
              width: "85%",
              height: 14,
              background: "var(--kt-bg-2)",
              borderRadius: 4,
            }}
          />
          <div
            style={{
              width: "60%",
              height: 12,
              background: "var(--kt-bg-2)",
              borderRadius: 4,
            }}
          />
        </div>
      ))}
    </div>
  );
}
