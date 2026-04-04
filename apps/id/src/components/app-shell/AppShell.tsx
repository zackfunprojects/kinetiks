"use client";

import { useState } from "react";
import { TabBar } from "./TabBar";
import { SettingsModal } from "./SettingsModal";

export interface AppAccount {
  id: string;
  codename: string;
  displayName: string | null;
  systemName: string | null;
  kineticsConnected: boolean | null;
}

interface AppShellProps {
  account: AppAccount;
  userEmail: string;
  children: React.ReactNode;
}

export function AppShell({ account, userEmail, children }: AppShellProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg-base)",
      }}
    >
      <TabBar
        systemName={account.systemName}
        onSettingsClick={() => setSettingsOpen(true)}
      />
      <main style={{ flex: 1, overflow: "hidden" }}>{children}</main>
      {settingsOpen && (
        <SettingsModal
          account={account}
          userEmail={userEmail}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
