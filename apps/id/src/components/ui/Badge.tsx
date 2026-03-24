type BadgeVariant = "default" | "success" | "warning" | "error" | "purple";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const VARIANT_STYLES: Record<
  BadgeVariant,
  { background: string; color: string }
> = {
  default: { background: "#F3F4F6", color: "#374151" },
  success: { background: "#ECFDF5", color: "#065F46" },
  warning: { background: "#FFFBEB", color: "#92400E" },
  error: { background: "#FEF2F2", color: "#991B1B" },
  purple: { background: "#F0EDFF", color: "#6C5CE7" },
};

export function Badge({ label, variant = "default" }: BadgeProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 500,
        lineHeight: "18px",
        ...styles,
      }}
    >
      {label}
    </span>
  );
}
