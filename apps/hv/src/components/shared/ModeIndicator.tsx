"use client";

/* ── Types ─────────────────────────────────────────────────── */

type AutomationMode = "human" | "assisted" | "autopilot";

interface ModeIndicatorProps {
  mode: AutomationMode;
  size?: "sm" | "md";
}

/* ── Constants ─────────────────────────────────────────────── */

const MODE_COLORS: Record<AutomationMode, string> = {
  human: "var(--mode-human, #6B6860)",
  assisted: "var(--mode-assisted, #C08B2D)",
  autopilot: "var(--mode-autopilot, #3D7C47)",
};

const MODE_MUTED: Record<AutomationMode, string> = {
  human: "var(--mode-human-muted, rgba(107,104,96,0.10))",
  assisted: "var(--mode-assisted-muted, rgba(192,139,45,0.10))",
  autopilot: "var(--mode-autopilot-muted, rgba(61,124,71,0.10))",
};

const MODE_ICONS: Record<AutomationMode, string> = {
  human: "\u{1F64B}",
  assisted: "\u{1F331}",
  autopilot: "\u{1F33F}",
};

const MODE_LABELS: Record<AutomationMode, string> = {
  human: "Human",
  assisted: "Assisted",
  autopilot: "Autopilot",
};

/* ── Component ─────────────────────────────────────────────── */

export default function ModeIndicator({ mode, size = "md" }: ModeIndicatorProps) {
  const height = size === "sm" ? 20 : 24;
  const fontSize = size === "sm" ? 11 : 12;
  const iconSize = size === "sm" ? 10 : 12;
  const px = size === "sm" ? 6 : 8;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height,
        padding: `0 ${px}px`,
        borderRadius: height / 2,
        backgroundColor: MODE_MUTED[mode],
        color: MODE_COLORS[mode],
        fontSize,
        fontWeight: 600,
        fontFamily: "var(--font-sans)",
        lineHeight: 1,
        whiteSpace: "nowrap",
        transition: `all var(--duration-normal, 250ms) var(--ease-spring, cubic-bezier(0.34,1.56,0.64,1))`,
      }}
    >
      <span style={{ fontSize: iconSize, lineHeight: 1 }}>{MODE_ICONS[mode]}</span>
      {MODE_LABELS[mode]}
    </span>
  );
}
