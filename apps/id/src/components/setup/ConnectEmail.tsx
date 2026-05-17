"use client";

import { useState } from "react";

interface ConnectEmailProps {
  onSkip: () => void;
}

export function ConnectEmail({ onSkip }: ConnectEmailProps) {
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async (provider: "google" | "microsoft") => {
    setConnecting(true);
    // Open OAuth popup/redirect
    window.location.href = `/api/connections/email?provider=${provider}`;
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--kt-fg-1)", margin: "0 0 8px", textAlign: "center" }}>
        Connect email
      </h1>
      <p style={{ fontSize: 14, color: "var(--kt-fg-2)", margin: "0 0 32px", textAlign: "center", lineHeight: 1.5 }}>
        Your system will send briefs, alerts, and meeting prep from your email.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
        <ProviderButton
          label="Google Workspace"
          description="Gmail, Google Calendar"
          onClick={() => handleConnect("google")}
          disabled={connecting}
        />
        <ProviderButton
          label="Microsoft 365"
          description="Outlook, Microsoft Calendar"
          onClick={() => handleConnect("microsoft")}
          disabled={connecting}
        />
      </div>

      <button
        onClick={onSkip}
        style={{
          width: "100%",
          padding: "10px 24px",
          borderRadius: 8,
          border: "none",
          fontSize: 13,
          color: "var(--kt-fg-3)",
          background: "transparent",
          cursor: "pointer",
        }}
      >
        Skip for now
      </button>
    </div>
  );
}

function ProviderButton({
  label,
  description,
  onClick,
  disabled,
}: {
  label: string;
  description: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "14px 16px",
        borderRadius: 8,
        border: "1px solid var(--kt-border-1)",
        background: "var(--kt-bg-subtle)",
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--kt-fg-1)" }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color: "var(--kt-fg-3)" }}>
        {description}
      </span>
    </button>
  );
}
