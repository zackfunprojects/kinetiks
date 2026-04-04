"use client";

import type { SettingsSection } from "./SettingsModal";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "billing", label: "Billing" },
  { id: "api-keys", label: "API Keys" },
  { id: "notifications", label: "Notifications" },
  { id: "danger-zone", label: "Danger Zone" },
];

interface SettingsNavProps {
  active: SettingsSection;
  onSelect: (section: SettingsSection) => void;
}

export function SettingsNav({ active, onSelect }: SettingsNavProps) {
  return (
    <div
      style={{
        width: 200,
        borderRight: "1px solid var(--border-muted)",
        padding: "24px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <h2
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text-primary)",
          margin: "0 0 16px 8px",
          fontFamily: "var(--font-mono), monospace",
        }}
      >
        Settings
      </h2>
      {SECTIONS.map((section) => {
        const isActive = active === section.id;
        return (
          <button
            key={section.id}
            onClick={() => onSelect(section.id)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 12px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: isActive ? 500 : 400,
              color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
              background: isActive ? "var(--accent-subtle)" : "transparent",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {section.label}
          </button>
        );
      })}
    </div>
  );
}
