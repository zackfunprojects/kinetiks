"use client";

export default function GeneralSettings() {
  return (
    <div>
      <div
        style={{
          padding: 20,
          borderRadius: 12,
          border: "1px solid var(--border-subtle)",
          backgroundColor: "var(--surface-raised)",
          marginBottom: 16,
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>
          Account & Billing
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
          Account settings, billing, and integrations are managed in your Kinetiks ID dashboard.
        </p>
        <a
          href="https://id.kinetiks.ai"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid var(--border-subtle)",
            backgroundColor: "transparent",
            color: "var(--text-primary)",
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Open Kinetiks ID
        </a>
      </div>

      <div
        style={{
          padding: 20,
          borderRadius: 12,
          border: "1px solid var(--border-subtle)",
          backgroundColor: "var(--surface-raised)",
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>
          Harvest App Status
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: "var(--harvest-green)",
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Active</span>
        </div>
      </div>
    </div>
  );
}
