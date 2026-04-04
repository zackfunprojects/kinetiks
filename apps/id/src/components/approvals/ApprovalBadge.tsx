"use client";

interface ApprovalBadgeProps {
  count: number;
}

export function ApprovalBadge({ count }: ApprovalBadgeProps) {
  if (count <= 0) return null;

  return (
    <span
      style={{
        background: "var(--accent-secondary)",
        color: "var(--bg-base)",
        fontSize: 10,
        fontWeight: 600,
        borderRadius: 10,
        padding: "1px 6px",
        minWidth: 16,
        textAlign: "center",
        display: "inline-block",
      }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
