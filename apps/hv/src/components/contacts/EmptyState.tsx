"use client";

interface EmptyStateProps {
  onAddContact: () => void;
  onEnrichDomain: () => void;
}

export function EmptyState({ onAddContact, onEnrichDomain }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 32px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "12px",
          backgroundColor: "var(--surface-raised)",
          border: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "16px",
          fontSize: "24px",
          color: "var(--text-tertiary)",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      </div>
      <h3
        style={{
          fontSize: "1rem",
          fontWeight: 600,
          color: "var(--text-primary)",
          marginBottom: "6px",
        }}
      >
        No contacts yet
      </h3>
      <p
        style={{
          fontSize: "0.8125rem",
          color: "var(--text-secondary)",
          marginBottom: "24px",
          maxWidth: 360,
          lineHeight: 1.5,
        }}
      >
        Add contacts manually or enrich a domain to discover prospects automatically.
      </p>
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={onAddContact}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "1px solid var(--border-default)",
            backgroundColor: "var(--surface-raised)",
            color: "var(--text-primary)",
            fontSize: "0.8125rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Add contact
        </button>
        <button
          onClick={onEnrichDomain}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            backgroundColor: "var(--accent-primary)",
            color: "#fff",
            fontSize: "0.8125rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Enrich domain
        </button>
      </div>
    </div>
  );
}
