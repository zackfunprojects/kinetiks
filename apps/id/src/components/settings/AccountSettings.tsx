"use client";

import type { AppAccount } from "@/components/app-shell/AppShell";

interface AccountSettingsProps {
  account: AppAccount;
  userEmail: string;
}

export function AccountSettings({ account, userEmail }: AccountSettingsProps) {
  return (
    <div>
      <h3
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "var(--text-primary)",
          margin: "0 0 24px",
        }}
      >
        Account
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <SettingsField label="Email" value={userEmail} />
        <SettingsField label="Kinetiks ID" value={account.codename} />
        <SettingsField
          label="Display Name"
          value={account.displayName || "Not set"}
        />
        {account.systemName && (
          <SettingsField label="System Name" value={account.systemName} />
        )}
      </div>
    </div>
  );
}

function SettingsField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-tertiary)",
          marginBottom: 4,
          fontFamily: "var(--font-mono), monospace",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, color: "var(--text-primary)" }}>{value}</div>
    </div>
  );
}
