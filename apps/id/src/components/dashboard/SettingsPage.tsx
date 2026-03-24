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
    border: "1px solid #E5E7EB",
    borderRadius: 6,
    fontSize: 13,
    color: "#1a1a2e",
    background: "#fff",
    boxSizing: "border-box",
  };

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1a1a2e" }}>
          Settings
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "#666" }}>
          Account settings and configuration
        </p>
      </div>

      {/* Profile */}
      <Card style={{ marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "#1a1a2e" }}>
          Profile
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6B7280", marginBottom: 4 }}>
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
                  background: nameSaved ? "#10B981" : "#6C5CE7",
                  color: "#fff",
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
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6B7280", marginBottom: 4 }}>
              Kinetiks ID
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={account.codename}
                readOnly
                style={{ ...inputStyle, flex: 1, background: "#F9FAFB", color: "#6C5CE7", fontWeight: 600 }}
              />
              <button
                onClick={copyCodename}
                style={{
                  padding: "8px 14px",
                  background: "#fff",
                  color: "#374151",
                  border: "1px solid #E5E7EB",
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
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6B7280", marginBottom: 4 }}>
              Email
            </label>
            <input
              type="text"
              value={email}
              readOnly
              style={{ ...inputStyle, background: "#F9FAFB", color: "#999" }}
            />
          </div>
        </div>
      </Card>

      {/* API Keys (BYOK) */}
      <Card style={{ marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600, color: "#1a1a2e" }}>
          API Keys
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#666" }}>
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
                background: "#FAFAFA",
                borderRadius: 8,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#1a1a2e" }}>
                    {provider.label}
                  </span>
                  <Badge
                    label={keysSet[provider.key] ? "Configured" : "Not set"}
                    variant={keysSet[provider.key] ? "success" : "default"}
                  />
                </div>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#999" }}>
                  {provider.description}
                </p>
              </div>
              <button
                onClick={() => { setApiKeyModal(provider.key); setApiKeyValue(""); }}
                style={{
                  padding: "6px 12px",
                  background: "#fff",
                  color: "#374151",
                  border: "1px solid #E5E7EB",
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
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600, color: "#991B1B" }}>
          Danger Zone
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#666" }}>
          Permanently delete your account and all associated data
        </p>
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              padding: "8px 16px",
              background: "#fff",
              color: "#991B1B",
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
            <p style={{ margin: 0, fontSize: 13, color: "#991B1B", fontWeight: 500 }}>
              Are you sure? This cannot be undone.
            </p>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
              style={{
                padding: "6px 14px",
                background: "#fff",
                color: deleting ? "#D1D5DB" : "#374151",
                border: "1px solid #E5E7EB",
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
                background: "#991B1B",
                color: "#fff",
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
          <p role="alert" style={{ margin: "12px 0 0", fontSize: 13, color: "#EF4444" }}>
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
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              width: 400,
              maxWidth: "90vw",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600, color: "#1a1a2e" }}>
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
                  background: "#fff",
                  color: "#374151",
                  border: "1px solid #E5E7EB",
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
                  background: "#6C5CE7",
                  color: "#fff",
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
