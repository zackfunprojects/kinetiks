"use client";

import type { SettingsSection } from "./SettingsModal";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "appearance", label: "Appearance" },
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
        borderRight: "1px solid var(--kt-border-2)",
        padding: "var(--kt-s-5) var(--kt-s-3)",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <h2
        className="kt-mono"
        style={{
          fontSize: "var(--kt-fs-14)",
          fontWeight: "var(--kt-fw-semi)",
          color: "var(--kt-fg-1)",
          margin: "0 0 var(--kt-s-4) var(--kt-s-2)",
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
            aria-current={isActive ? "page" : undefined}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "var(--kt-s-2) var(--kt-s-3)",
              borderRadius: "var(--kt-radius-1)",
              border: "none",
              cursor: "pointer",
              fontSize: "var(--kt-fs-13)",
              fontWeight: isActive ? "var(--kt-fw-med)" : "var(--kt-fw-reg)",
              color: isActive ? "var(--kt-fg-1)" : "var(--kt-fg-2)",
              background: isActive ? "var(--kt-accent-soft)" : "transparent",
              transition: "background var(--kt-dur-1) var(--kt-ease-standard), color var(--kt-dur-1) var(--kt-ease-standard)",
            }}
          >
            {section.label}
          </button>
        );
      })}
    </div>
  );
}
