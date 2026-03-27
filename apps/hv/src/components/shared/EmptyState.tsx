interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; href: string };
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        borderRadius: "var(--radius-lg, 12px)",
        border: "1px dashed var(--border-default, var(--border-subtle))",
        backgroundColor: "var(--surface-elevated, var(--surface-raised))",
        textAlign: "center",
      }}
    >
      {icon && (
        <span style={{ fontSize: 32, marginBottom: 12 }} role="img" aria-hidden>
          {icon}
        </span>
      )}
      <h3
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--text-secondary)",
          margin: 0,
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            fontSize: 13,
            color: "var(--text-tertiary)",
            margin: "6px 0 0",
            maxWidth: 320,
          }}
        >
          {description}
        </p>
      )}
      {action && (
        <a
          href={action.href}
          style={{
            display: "inline-block",
            marginTop: 16,
            padding: "8px 20px",
            borderRadius: 8,
            border: "none",
            backgroundColor: "var(--harvest-green)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {action.label}
        </a>
      )}
    </div>
  );
}
