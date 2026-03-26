"use client";

interface VerificationBadgeProps {
  grade: string | null;
}

const GRADE_CONFIG: Record<string, { color: string; label: string }> = {
  verified: { color: "var(--success, #3d8f46)", label: "Verified" },
  likely: { color: "var(--warning, #d4a017)", label: "Likely" },
  unverified: { color: "var(--text-tertiary)", label: "Unverified" },
};

export function VerificationBadge({ grade }: VerificationBadgeProps): JSX.Element | null {
  if (!grade) return null;

  const config = GRADE_CONFIG[grade] ?? GRADE_CONFIG.unverified;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "0.6875rem",
        color: config.color,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: config.color,
          flexShrink: 0,
        }}
      />
      {config.label}
    </span>
  );
}
