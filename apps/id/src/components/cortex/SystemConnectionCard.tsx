interface SystemConnectionCardProps {
  label: string;
  status: string;
  description: string;
}

export function SystemConnectionCard({ label, status, description }: SystemConnectionCardProps) {
  const lower = status.toLowerCase();
  const connected = lower === "connected" || lower === "active";

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 8,
        border: "1px solid var(--kt-border-2)",
        background: "var(--kt-bg-muted)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--kt-fg-1)" }}>
          {label}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 4,
            background: connected ? "var(--kt-success-soft)" : "var(--kt-bg-base)",
            color: connected ? "var(--kt-success)" : "var(--kt-fg-3)",
            textTransform: "uppercase",
          }}
        >
          {status}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--kt-fg-3)", margin: "0 0 12px", lineHeight: 1.4 }}>
        {description}
      </p>
      <button
        disabled
        style={{
          padding: "6px 12px",
          borderRadius: 6,
          border: "1px solid var(--kt-border-1)",
          background: "transparent",
          color: "var(--kt-fg-3)",
          fontSize: 12,
          cursor: "not-allowed",
          opacity: 0.5,
        }}
      >
        {connected ? "Configure" : "Connect"}
      </button>
    </div>
  );
}
