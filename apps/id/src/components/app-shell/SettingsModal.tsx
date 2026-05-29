"use client";

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { SettingsNav } from "./SettingsNav";
import { useState } from "react";
import type { AppAccount } from "./AppShell";
import { AccountSettings } from "@/components/settings/AccountSettings";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { BillingSettings } from "@/components/settings/BillingSettings";
import { ApiKeySettings } from "@/components/settings/ApiKeySettings";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { DangerZone } from "@/components/settings/DangerZone";

export type SettingsSection = "account" | "appearance" | "billing" | "api-keys" | "notifications" | "danger-zone";

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
          background: "var(--kt-overlay-strong)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        style={{
          position: "relative",
          width: "calc(100vw - 80px)",
          maxWidth: 960,
          height: "calc(100vh - 80px)",
          maxHeight: 720,
          background: "var(--kt-bg-subtle)",
          borderRadius: "var(--kt-radius-3)",
          border: "1px solid var(--kt-border-1)",
          boxShadow: "var(--kt-shadow-lg)",
          display: "flex",
          overflow: "hidden",
        }}
      >
        {/* Nav */}
        <SettingsNav active={activeSection} onSelect={setActiveSection} />

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "var(--kt-s-6)" }}>
          {activeSection === "account" && (
            <AccountSettings account={account} userEmail={userEmail} />
          )}
          {activeSection === "appearance" && <AppearanceSettings />}
          {activeSection === "billing" && <BillingSettings />}
          {activeSection === "api-keys" && <ApiKeySettings />}
          {activeSection === "notifications" && <NotificationSettings />}
          {activeSection === "danger-zone" && <DangerZone />}
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="kt-icon-btn"
          style={{ position: "absolute", top: "var(--kt-s-4)", right: "var(--kt-s-4)" }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
