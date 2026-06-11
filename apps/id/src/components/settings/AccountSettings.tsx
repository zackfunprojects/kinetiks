"use client";

import { useRef, useState } from "react";
import { Button } from "@kinetiks/ui";
import type { AppAccount } from "@/components/app-shell/AppShell";

const SAVE_ERROR_MESSAGE = "We couldn't save your display name. Try again.";

interface AccountSettingsProps {
  account: AppAccount;
  userEmail: string;
}

/**
 * C2 - account section with the display-name edit ported from the
 * legacy (dashboard)/settings page (PATCH /api/account) and the
 * codename copy affordance. Email and system name stay read-only.
 */
export function AccountSettings({ account, userEmail }: AccountSettingsProps) {
  const [displayName, setDisplayName] = useState(account.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleSaveName() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName.trim() }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setSaved(true);
    } catch {
      setError(SAVE_ERROR_MESSAGE);
    } finally {
      setSaving(false);
    }
  }

  async function copyCodename() {
    try {
      await navigator.clipboard.writeText(account.codename);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; no-op.
    }
  }

  return (
    <div>
      <h3
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "var(--kt-fg-1)",
          margin: "0 0 24px",
        }}
      >
        Account
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <SettingsField label="Email" value={userEmail} />

        <div>
          <FieldLabel label="Kinetiks ID" />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 14,
                color: "var(--kt-fg-1)",
                fontFamily: "var(--font-mono), monospace",
              }}
            >
              {account.codename}
            </span>
            <Button variant="ghost" size="sm" onClick={copyCodename} aria-label="Copy Kinetiks ID">
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>

        <div>
          <FieldLabel label="Display Name" />
          <div style={{ display: "flex", gap: 8, maxWidth: 380 }}>
            <input
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setSaved(false);
              }}
              placeholder="Your name"
              aria-label="Display name"
              className="kt-field"
              style={{ flex: 1 }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName();
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSaveName}
              disabled={saving || displayName.trim() === (account.displayName ?? "")}
            >
              {saving ? "Saving..." : saved ? "Saved" : "Save"}
            </Button>
          </div>
          {error && (
            <p role="alert" style={{ margin: "8px 0 0", fontSize: 13, color: "var(--kt-danger)" }}>
              {error}
            </p>
          )}
        </div>

        {account.systemName && (
          <SettingsField label="System Name" value={account.systemName} />
        )}
      </div>
    </div>
  );
}

function FieldLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 500,
        color: "var(--kt-fg-3)",
        marginBottom: 4,
        fontFamily: "var(--font-mono), monospace",
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      {label}
    </div>
  );
}

function SettingsField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <FieldLabel label={label} />
      <div style={{ fontSize: 14, color: "var(--kt-fg-1)" }}>{value}</div>
    </div>
  );
}
