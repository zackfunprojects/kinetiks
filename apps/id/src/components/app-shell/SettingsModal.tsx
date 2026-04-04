"use client";

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { SettingsNav } from "./SettingsNav";
import { useState } from "react";
import type { AppAccount } from "./AppShell";
import { AccountSettings } from "@/components/settings/AccountSettings";
import { BillingSettings } from "@/components/settings/BillingSettings";
import { ApiKeySettings } from "@/components/settings/ApiKeySettings";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { DangerZone } from "@/components/settings/DangerZone";

export type SettingsSection = "account" | "billing" | "api-keys" | "notifications" | "danger-zone";

interface SettingsModalProps {
  account: AppAccount;
  userEmail: string;
  onClose: () => void;
}

export function SettingsModal({ account, userEmail, onClose }: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("account");

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  const content = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "relative",
          width: "calc(100vw - 80px)",
          maxWidth: 960,
          height: "calc(100vh - 80px)",
          maxHeight: 720,
          background: "var(--bg-surface)",
          borderRadius: 12,
          border: "1px solid var(--border-default)",
          display: "flex",
          overflow: "hidden",
        }}
      >
        {/* Nav */}
        <SettingsNav active={activeSection} onSelect={setActiveSection} />

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 32 }}>
          {activeSection === "account" && (
            <AccountSettings account={account} userEmail={userEmail} />
          )}
          {activeSection === "billing" && <BillingSettings />}
          {activeSection === "api-keys" && <ApiKeySettings />}
          {activeSection === "notifications" && <NotificationSettings />}
          {activeSection === "danger-zone" && <DangerZone />}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close settings"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            width: 32,
            height: 32,
            borderRadius: 6,
            border: "none",
            background: "var(--bg-surface-raised)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
          }}
        >
          x
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
