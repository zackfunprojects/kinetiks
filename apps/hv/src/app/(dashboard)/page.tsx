export default function DashboardPage() {
  return (
    <div>
      <h1
        style={{
          fontSize: "1.375rem",
          fontWeight: 600,
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
          marginBottom: "8px",
        }}
      >
        Dashboard
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
        Welcome to Harvest. Your outbound command center.
      </p>

      {/* KPI cards placeholder */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "16px",
          marginTop: "24px",
        }}
      >
        {[
          { label: "Active Prospects", value: "-" },
          { label: "Emails Sent (7d)", value: "-" },
          { label: "Reply Rate", value: "-" },
          { label: "Pipeline Value", value: "-" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            style={{
              backgroundColor: "var(--surface-raised)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "8px",
              padding: "20px",
            }}
          >
            <div
              style={{
                fontSize: "0.6875rem",
                fontWeight: 500,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: "8px",
              }}
            >
              {kpi.label}
            </div>
            <div
              style={{
                fontSize: "1.75rem",
                fontWeight: 600,
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {kpi.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
