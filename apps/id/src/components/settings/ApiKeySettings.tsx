"use client";

export function ApiKeySettings() {
  return (
    <div>
      <h3
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "var(--text-primary)",
          margin: "0 0 24px",
        }}
      >
        API Keys
      </h3>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
        Bring your own API keys for AI and data services.
      </p>
      <div
        style={{
          padding: 16,
          borderRadius: 8,
          border: "1px solid var(--border-muted)",
          background: "var(--bg-surface-raised)",
          fontSize: 13,
          color: "var(--text-tertiary)",
        }}
      >
        API key management migrating from previous settings page. Keys for Anthropic, Firecrawl, and People Data Labs.
      </div>
    </div>
  );
}
