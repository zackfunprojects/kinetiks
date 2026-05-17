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
    background: "var(--kt-bg-muted)",
    color: "var(--kt-fg-2)",
    borderLeft: "2px solid var(--kt-border-1)",
  },
  success: {
    background: "var(--kt-success-soft)",
    color: "var(--kt-success)",
    borderLeft: "2px solid var(--kt-success)",
  },
  warning: {
    background: "var(--kt-warning-soft)",
    color: "var(--kt-warning)",
    borderLeft: "2px solid var(--kt-warning)",
  },
  error: {
    background: "var(--kt-danger-soft)",
    color: "var(--kt-danger)",
    borderLeft: "2px solid var(--kt-danger)",
  },
  accent: {
    background: "var(--kt-accent-soft)",
    color: "var(--kt-accent)",
    borderLeft: "2px solid var(--kt-accent)",
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
