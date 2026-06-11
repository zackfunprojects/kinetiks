"use client";

import { useEffect, useState } from "react";
import { Button } from "@kinetiks/ui";

const LOAD_ERROR_MESSAGE = "We couldn't load your key status. Try again.";
const SAVE_ERROR_MESSAGE = "We couldn't save that key. Try again.";

interface ServiceDescriptor {
  provider: string;
  name: string;
  description: string;
  placeholder: string;
}

/**
 * BYO service keys, matching VALID_PROVIDERS in
 * /api/account/api-keys. The route stores booleans only - actual keys
 * are encrypted at rest and never round-trip to the client.
 */
const SERVICES: ServiceDescriptor[] = [
  {
    provider: "anthropic",
    name: "Anthropic",
    description: "Powers Marcus and every AI call. Bring your own key to use your rate limits.",
    placeholder: "sk-ant-...",
  },
  {
    provider: "firecrawl",
    name: "Firecrawl",
    description: "Website crawling during onboarding and competitive monitoring.",
    placeholder: "fc-...",
  },
  {
    provider: "pdl",
    name: "People Data Labs",
    description: "Contact and company enrichment.",
    placeholder: "Your PDL API key",
  },
];

/**
 * C2 - the live BYOK manager, ported from the legacy
 * (dashboard)/settings page. GET shows which keys are set (booleans
 * only); POST saves a new or replacement key per provider.
 */
export function ApiKeySettings() {
  const [keysSet, setKeysSet] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/account/api-keys");
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = await res.json();
        const envelope = json.data ?? json;
        if (!cancelled) setKeysSet(envelope.keys_set ?? {});
      } catch {
        if (!cancelled) setLoadError(LOAD_ERROR_MESSAGE);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    if (!editing || !keyValue.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/account/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: editing, api_key: keyValue.trim() }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setKeysSet((prev) => ({ ...prev, [editing]: true }));
      setEditing(null);
      setKeyValue("");
    } catch {
      setSaveError(SAVE_ERROR_MESSAGE);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h3
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "var(--kt-fg-1)",
          margin: "0 0 8px",
        }}
      >
        API Keys
      </h3>
      <p style={{ fontSize: 14, color: "var(--kt-fg-2)", margin: "0 0 24px" }}>
        Bring your own keys for AI and data services. Keys are encrypted at
        rest and never shown again after saving.
      </p>

      {loading ? (
        <div aria-busy="true" aria-live="polite" aria-label="Loading key status">
          {SERVICES.map((s) => (
            <div
              key={s.provider}
              style={{
                height: 64,
                marginBottom: 12,
                borderRadius: 8,
                background: "var(--kt-bg-muted)",
                opacity: 0.5,
              }}
            />
          ))}
        </div>
      ) : loadError ? (
        <p role="alert" style={{ fontSize: 14, color: "var(--kt-fg-2)", margin: 0 }}>
          {loadError}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {SERVICES.map((service) => {
            const isSet = keysSet[service.provider] === true;
            const isEditing = editing === service.provider;
            return (
              <div
                key={service.provider}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  border: "1px solid var(--kt-border-2)",
                  background: "var(--kt-bg-subtle)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--kt-fg-1)" }}>
                        {service.name}
                      </span>
                      <span
                        className="kt-data-inline"
                        style={{
                          fontSize: 11,
                          padding: "1px 8px",
                          borderRadius: 999,
                          border: "1px solid var(--kt-border-2)",
                          color: isSet ? "var(--kt-success)" : "var(--kt-fg-3)",
                        }}
                      >
                        {isSet ? "Key set" : "Not set"}
                      </span>
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--kt-fg-3)" }}>
                      {service.description}
                    </p>
                  </div>
                  {!isEditing && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditing(service.provider);
                        setKeyValue("");
                        setSaveError(null);
                      }}
                    >
                      {isSet ? "Replace key" : "Add key"}
                    </Button>
                  )}
                </div>

                {isEditing && (
                  <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <input
                      type="password"
                      value={keyValue}
                      onChange={(e) => setKeyValue(e.target.value)}
                      placeholder={service.placeholder}
                      aria-label={`${service.name} API key`}
                      autoFocus
                      className="kt-field"
                      style={{ flex: 1 }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave();
                        if (e.key === "Escape") setEditing(null);
                      }}
                    />
                    <Button
                      variant="accent"
                      size="sm"
                      onClick={handleSave}
                      disabled={saving || !keyValue.trim()}
                    >
                      {saving ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(null)}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
                {isEditing && saveError && (
                  <p role="alert" style={{ margin: "8px 0 0", fontSize: 13, color: "var(--kt-danger)" }}>
                    {saveError}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
