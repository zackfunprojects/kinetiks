"use client";

/* ── Types ─────────────────────────────────────────────────── */

type AiBadgeMode = "assisted" | "autopilot";

interface AiBadgeProps {
  mode: AiBadgeMode;
  tooltip?: string;
}

/* ── Constants ─────────────────────────────────────────────── */

const BADGE_CONFIG: Record<AiBadgeMode, { icon: string; color: string }> = {
  assisted: {
    icon: "\u{1F331}",
    color: "var(--mode-assisted, #C08B2D)",
  },
  autopilot: {
    icon: "\u{1F33F}",
    color: "var(--mode-autopilot, #3D7C47)",
  },
};

/* ── Component ─────────────────────────────────────────────── */

export default function AiBadge({ mode, tooltip }: AiBadgeProps) {
  const config = BADGE_CONFIG[mode];

  return (
    <span
      title={tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 16,
        height: 16,
        fontSize: 11,
        lineHeight: 1,
        color: config.color,
        cursor: tooltip ? "help" : "default",
        flexShrink: 0,
      }}
    >
      {config.icon}
    </span>
  );
}
