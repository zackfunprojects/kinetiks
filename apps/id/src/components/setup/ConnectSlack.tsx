"use client";

import { useState } from "react";

interface ConnectSlackProps {
  systemName: string;
  onSkip: () => void;
}

export function ConnectSlack({ systemName, onSkip }: ConnectSlackProps) {
  const [connecting, setConnecting] = useState(false);

  const handleConnect = () => {
    setConnecting(true);
    window.location.href = "/api/connections/slack";
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--kt-fg-1)", margin: "0 0 8px", textAlign: "center" }}>
        Connect Slack
      </h1>
      <p style={{ fontSize: 14, color: "var(--kt-fg-2)", margin: "0 0 32px", textAlign: "center", lineHeight: 1.5 }}>
        {systemName} will join your Slack workspace as a bot - delivering briefs, handling approvals, and monitoring channels for GTM intelligence.
      </p>

      <button
        onClick={handleConnect}
        disabled={connecting}
        style={{
          width: "100%",
          padding: "14px 16px",
          borderRadius: 8,
          border: "1px solid var(--kt-border-1)",
          background: "var(--kt-bg-subtle)",
          cursor: connecting ? "not-allowed" : "pointer",
          textAlign: "left",
          marginBottom: 24,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--kt-fg-1)" }}>
          {connecting ? "Connecting..." : "Add to Slack"}
        </span>
        <br />
        <span style={{ fontSize: 12, color: "var(--kt-fg-3)" }}>
          {systemName} will appear as @{systemName.toLowerCase().replace(/\s+/g, "-")}
        </span>
      </button>

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
