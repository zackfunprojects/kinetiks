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
        border: "1px solid var(--border-muted)",
        background: "var(--bg-surface-raised)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
          {label}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 4,
            background: connected ? "var(--success-muted)" : "var(--bg-inset)",
            color: connected ? "var(--success)" : "var(--text-tertiary)",
            textTransform: "uppercase",
          }}
        >
          {status}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 12px", lineHeight: 1.4 }}>
        {description}
      </p>
      <button
        disabled
        style={{
          padding: "6px 12px",
          borderRadius: 6,
          border: "1px solid var(--border-default)",
          background: "transparent",
          color: "var(--text-tertiary)",
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
