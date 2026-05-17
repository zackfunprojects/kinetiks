"use client";

export function DangerZone() {
  return (
    <div>
      <h3
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "var(--kt-danger)",
          margin: "0 0 24px",
        }}
      >
        Danger Zone
      </h3>
      <div
        style={{
          padding: 16,
          borderRadius: 8,
          border: "1px solid var(--kt-danger-soft)",
          background: "var(--kt-bg-muted)",
        }}
      >
        <p style={{ fontSize: 14, color: "var(--kt-fg-2)", margin: "0 0 12px" }}>
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <button
          disabled
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid var(--kt-danger)",
            background: "transparent",
            color: "var(--kt-danger)",
            fontSize: 13,
            cursor: "not-allowed",
            opacity: 0.5,
          }}
        >
          Delete Account
        </button>
      </div>
    </div>
  );
}
