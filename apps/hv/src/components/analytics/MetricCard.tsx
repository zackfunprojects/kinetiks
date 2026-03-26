"use client";

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
}

export default function MetricCard({ label, value, subtitle }: MetricCardProps) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 12,
        border: "1px solid var(--border-subtle)",
        backgroundColor: "var(--surface-raised)",
        flex: "1 1 0",
        minWidth: 140,
      }}
    >
      <p
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          margin: 0,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: "8px 0 0",
          lineHeight: 1,
        }}
      >
        {value}
      </p>
      {subtitle && (
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            margin: "6px 0 0",
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
