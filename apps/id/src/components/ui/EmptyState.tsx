import Link from "next/link";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: { label: string; href: string };
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "var(--bg-surface-raised)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
          fontSize: 20,
        }}
      >
        -
      </div>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
        {title}
      </h3>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--text-secondary)", maxWidth: 360 }}>
        {description}
      </p>
      {action && (
        <Link
          href={action.href}
          style={{
            marginTop: 16,
            padding: "8px 16px",
            background: "var(--accent-emphasis)",
            color: "var(--text-on-accent)",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
