"use client";

export function DangerZone() {
  return (
    <div>
      <h3
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "var(--error)",
          margin: "0 0 24px",
        }}
      >
        Danger Zone
      </h3>
      <div
        style={{
          padding: 16,
          borderRadius: 8,
          border: "1px solid var(--error-muted)",
          background: "var(--bg-surface-raised)",
        }}
      >
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 12px" }}>
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <button
          disabled
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid var(--error)",
            background: "transparent",
            color: "var(--error)",
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
