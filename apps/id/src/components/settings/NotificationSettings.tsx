"use client";

export function NotificationSettings() {
  return (
    <div>
      <h3
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "var(--kt-fg-1)",
          margin: "0 0 24px",
        }}
      >
        Notifications
      </h3>
      <p style={{ fontSize: 14, color: "var(--kt-fg-2)" }}>
        Configure brief schedules, notification channels, and quiet hours.
      </p>
    </div>
  );
}
