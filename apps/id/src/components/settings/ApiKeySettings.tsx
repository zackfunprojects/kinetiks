"use client";

export function ApiKeySettings() {
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
        API Keys
      </h3>
      <p style={{ fontSize: 14, color: "var(--kt-fg-2)", marginBottom: 16 }}>
        Bring your own API keys for AI and data services.
      </p>
      <div
        style={{
          padding: 16,
          borderRadius: 8,
          border: "1px solid var(--kt-border-2)",
          background: "var(--kt-bg-muted)",
          fontSize: 13,
          color: "var(--kt-fg-3)",
        }}
      >
        API key management migrating from previous settings page. Keys for Anthropic, Firecrawl, and People Data Labs.
      </div>
    </div>
  );
}
