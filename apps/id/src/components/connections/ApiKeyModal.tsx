"use client";

import { useState } from "react";
import type { ProviderDefinition } from "@kinetiks/types";

interface ApiKeyModalProps {
  provider: ProviderDefinition;
  onSubmit: (apiKey: string) => void;
  onClose: () => void;
}

export function ApiKeyModal({ provider, onSubmit, onClose }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!apiKey.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(apiKey.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: 420,
          maxWidth: "90vw",
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600 }}>
          Connect {provider.displayName}
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#666" }}>
          Enter your API key to connect. Your key is encrypted before storage.
        </p>

        <label
          htmlFor="api-key-input"
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 500,
            color: "#374151",
            marginBottom: 4,
          }}
        >
          API Key
        </label>
        <input
          id="api-key-input"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder={`Enter your ${provider.displayName} API key`}
          autoFocus
          style={{
            width: "100%",
            padding: "8px 12px",
            fontSize: 13,
            border: "1px solid #D1D5DB",
            borderRadius: 6,
            marginBottom: 16,
            boxSizing: "border-box",
            outline: "none",
          }}
        />

        {provider.docsUrl && (
          <p style={{ margin: "0 0 16px", fontSize: 11, color: "#999" }}>
            Find your API key in your{" "}
            <a
              href={provider.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#6C5CE7" }}
            >
              {provider.displayName} dashboard
            </a>
          </p>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              border: "1px solid #D1D5DB",
              borderRadius: 6,
              background: "#fff",
              cursor: "pointer",
              color: "#374151",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!apiKey.trim() || submitting}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 500,
              border: "none",
              borderRadius: 6,
              background: "#6C5CE7",
              color: "#fff",
              cursor:
                !apiKey.trim() || submitting ? "not-allowed" : "pointer",
              opacity: !apiKey.trim() || submitting ? 0.5 : 1,
            }}
          >
            {submitting ? "Connecting..." : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}
