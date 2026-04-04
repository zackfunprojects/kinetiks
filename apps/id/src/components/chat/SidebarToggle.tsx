"use client";

export type SidebarPanel = "chats" | "approvals";

interface SidebarToggleProps {
  active: SidebarPanel;
  onToggle: (panel: SidebarPanel) => void;
  approvalCount?: number;
}

export function SidebarToggle({ active, onToggle, approvalCount = 0 }: SidebarToggleProps) {
  return (
    <div
      style={{
        display: "flex",
        background: "var(--bg-inset)",
        borderRadius: 6,
        padding: 2,
        gap: 2,
      }}
    >
      <ToggleButton
        label="Chats"
        active={active === "chats"}
        onClick={() => onToggle("chats")}
      />
      <ToggleButton
        label="Approvals"
        active={active === "approvals"}
        onClick={() => onToggle("approvals")}
        badge={approvalCount > 0 ? approvalCount : undefined}
      />
    </div>
  );
}

function ToggleButton({
  label,
  active,
  onClick,
  badge,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "6px 12px",
        borderRadius: 4,
        border: "none",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: active ? 500 : 400,
        color: active ? "var(--text-primary)" : "var(--text-tertiary)",
        background: active ? "var(--bg-surface-raised)" : "transparent",
        transition: "background 0.15s, color 0.15s",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      {label}
      {badge !== undefined && (
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
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
