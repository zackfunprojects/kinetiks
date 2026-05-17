"use client";

export function EmptyApprovals() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: "var(--kt-success-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <svg
          width={24}
          height={24}
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--kt-success)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p style={{ fontSize: 13, color: "var(--kt-fg-2)", margin: "0 0 4px" }}>
        All clear
      </p>
      <p style={{ fontSize: 12, color: "var(--kt-fg-3)", margin: 0 }}>
        No pending approvals
      </p>
    </div>
  );
}
