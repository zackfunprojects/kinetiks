"use client";

export function BillingSettings() {
  return (
    <div>
      <h3
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "var(--text-primary)",
          margin: "0 0 24px",
        }}
      >
        Billing
      </h3>
      <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
        Billing management will be available here. Current plan and usage details coming soon.
      </p>
    </div>
  );
}
