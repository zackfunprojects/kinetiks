type BadgeVariant = "default" | "success" | "warning" | "error" | "accent";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const VARIANT_STYLES: Record<
  BadgeVariant,
  { background: string; color: string; borderLeft: string }
> = {
  default: {
    background: "var(--bg-surface-raised)",
    color: "var(--text-secondary)",
    borderLeft: "2px solid var(--border-default)",
  },
  success: {
    background: "var(--success-muted)",
    color: "var(--success)",
    borderLeft: "2px solid var(--success)",
  },
  warning: {
    background: "var(--warning-muted)",
    color: "var(--warning)",
    borderLeft: "2px solid var(--warning)",
  },
  error: {
    background: "var(--error-muted)",
    color: "var(--error)",
    borderLeft: "2px solid var(--error)",
  },
  accent: {
    background: "var(--accent-muted)",
    color: "var(--accent)",
    borderLeft: "2px solid var(--accent)",
  },
};

export function Badge({ label, variant = "default" }: BadgeProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 500,
        fontFamily: "var(--font-mono), monospace",
        lineHeight: "18px",
        letterSpacing: "0.02em",
        ...styles,
      }}
    >
      {label}
    </span>
  );
}
