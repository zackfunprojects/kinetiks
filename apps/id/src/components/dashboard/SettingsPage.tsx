"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface SettingsPageProps {
  account: {
    id: string;
    codename: string;
    display_name: string | null;
    from_app: string | null;
  };
  email: string;
  apiKeysSet: {
    anthropic: boolean;
    firecrawl: boolean;
    pdl: boolean;
  };
}

const API_KEY_PROVIDERS = [
  { key: "anthropic" as const, label: "Anthropic", description: "Powers all AI features" },
  { key: "firecrawl" as const, label: "Firecrawl", description: "Website crawling and extraction" },
  { key: "pdl" as const, label: "People Data Labs", description: "Contact enrichment for Harvest" },
];

export function SettingsPage({ account, email, apiKeysSet }: SettingsPageProps) {
  const [displayName, setDisplayName] = useState(account.display_name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [apiKeyModal, setApiKeyModal] = useState<string | null>(null);
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [keysSet, setKeysSet] = useState(apiKeysSet);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSaveName() {
    setSavingName(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName }),
      });
      if (res.ok) setNameSaved(true);
    } finally {
      setSavingName(false);
    }
  }

  async function handleSaveApiKey() {
    if (!apiKeyModal || !apiKeyValue) return;
    setSavingKey(true);
    try {
      const res = await fetch("/api/account/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: apiKeyModal, api_key: apiKeyValue }),
      });
      if (res.ok) {
        setKeysSet((prev) => ({ ...prev, [apiKeyModal]: true }));
        setApiKeyModal(null);
        setApiKeyValue("");
      }
    } finally {
      setSavingKey(false);
    }
  }

  function copyCodename() {
    navigator.clipboard.writeText(account.codename);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete account");
      }
      // Redirect to login after successful deletion
      window.location.href = "/login";
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete account");
      setDeleting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid var(--border-default)",
    borderRadius: 6,
    fontSize: 13,
    color: "var(--text-primary)",
    background: "var(--bg-surface)",
    boxSizing: "border-box",
  };

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>
          Settings
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text-secondary)" }}>
          Account settings and configuration
        </p>
      </div>

      {/* Profile */}
      <Card style={{ marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
          Profile
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 4 }}>
              Display Name
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={displayName}
                onChange={(e) => { setDisplayName(e.target.value); setNameSaved(false); }}
                placeholder="Your name"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={handleSaveName}
                disabled={savingName || nameSaved}
                style={{
                  padding: "8px 14px",
                  background: nameSaved ? "var(--success)" : "var(--accent-emphasis)",
                  color: "var(--text-on-accent)",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {nameSaved ? "Saved" : savingName ? "..." : "Save"}
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 4 }}>
              Kinetiks ID
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={account.codename}
                readOnly
                style={{ ...inputStyle, flex: 1, background: "var(--bg-surface-raised)", color: "var(--accent)", fontWeight: 600, fontFamily: "var(--font-mono), monospace" }}
              />
              <button
                onClick={copyCodename}
                style={{
                  padding: "8px 14px",
                  background: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 4 }}>
              Email
            </label>
            <input
              type="text"
              value={email}
              readOnly
              style={{ ...inputStyle, background: "var(--bg-surface-raised)", color: "var(--text-tertiary)" }}
            />
          </div>
        </div>
      </Card>

      {/* API Keys (BYOK) */}
      <Card style={{ marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
          API Keys
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
          Bring your own keys for AI and enrichment features
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {API_KEY_PROVIDERS.map((provider) => (
            <div
              key={provider.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "var(--bg-base)",
                borderRadius: 8,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
                    {provider.label}
                  </span>
                  <Badge
                    label={keysSet[provider.key] ? "Configured" : "Not set"}
                    variant={keysSet[provider.key] ? "success" : "default"}
                  />
                </div>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-tertiary)" }}>
                  {provider.description}
                </p>
              </div>
              <button
                onClick={() => { setApiKeyModal(provider.key); setApiKeyValue(""); }}
                style={{
                  padding: "6px 12px",
                  background: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {keysSet[provider.key] ? "Update" : "Set Key"}
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* Danger Zone */}
      <Card style={{ border: "1px solid #FCA5A5" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600, color: "var(--error)" }}>
          Danger Zone
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
          Permanently delete your account and all associated data
        </p>
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              padding: "8px 16px",
              background: "var(--bg-surface)",
              color: "var(--error)",
              border: "1px solid #FCA5A5",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Delete Account
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--error)", fontWeight: 500 }}>
              Are you sure? This cannot be undone.
            </p>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
              style={{
                padding: "6px 14px",
                background: "var(--bg-surface)",
                color: deleting ? "var(--border-default)" : "var(--text-secondary)",
                border: "1px solid var(--border-default)",
                borderRadius: 6,
                fontSize: 13,
                cursor: deleting ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={deleting}
              style={{
                padding: "6px 14px",
                background: "var(--error)",
                color: "var(--text-on-accent)",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: deleting ? "not-allowed" : "pointer",
                opacity: deleting ? 0.6 : 1,
              }}
            >
              {deleting ? "Deleting..." : "Confirm Delete"}
            </button>
          </div>
        )}
        {deleteError && (
          <p role="alert" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--error)" }}>
            {deleteError}
          </p>
        )}
      </Card>

      {/* API Key Modal */}
      {apiKeyModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setApiKeyModal(null)}
        >
          <div
            style={{
              background: "var(--bg-surface)",
              borderRadius: 12,
              padding: 24,
              width: 400,
              maxWidth: "90vw",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
              {keysSet[apiKeyModal as keyof typeof keysSet] ? "Update" : "Set"}{" "}
              {API_KEY_PROVIDERS.find((p) => p.key === apiKeyModal)?.label} Key
            </h3>
            <input
              type="password"
              value={apiKeyValue}
              onChange={(e) => setApiKeyValue(e.target.value)}
              placeholder="Enter your API key"
              style={inputStyle}
              onKeyDown={(e) => e.key === "Enter" && handleSaveApiKey()}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setApiKeyModal(null)}
                style={{
                  padding: "8px 16px",
                  background: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveApiKey}
                disabled={!apiKeyValue || savingKey}
                style={{
                  padding: "8px 16px",
                  background: "var(--accent-emphasis)",
                  color: "var(--text-on-accent)",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: !apiKeyValue || savingKey ? "not-allowed" : "pointer",
                }}
              >
                {savingKey ? "Saving..." : "Save Key"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
