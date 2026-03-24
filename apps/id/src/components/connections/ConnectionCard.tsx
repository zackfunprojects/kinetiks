"use client";

import type { ConnectionPublic, ProviderDefinition } from "@kinetiks/types";

interface ConnectionCardProps {
  provider: ProviderDefinition;
  connection: ConnectionPublic | null;
  isSyncing: boolean;
  onConnect: () => void;
  onSync?: () => void;
  onDisconnect?: () => void;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> =
  {
    active: { bg: "var(--success-muted)", text: "var(--success)", dot: "var(--success)" },
    pending: { bg: "var(--warning-muted)", text: "var(--warning)", dot: "var(--warning)" },
    error: { bg: "var(--error-muted)", text: "var(--error)", dot: "var(--error)" },
    revoked: { bg: "var(--bg-surface-raised)", text: "var(--text-secondary)", dot: "var(--text-tertiary)" },
  };

function formatLastSync(lastSyncAt: string | null): string {
  if (!lastSyncAt) return "Never synced";
  const date = new Date(lastSyncAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function ConnectionCard({
  provider,
  connection,
  isSyncing,
  onConnect,
  onSync,
  onDisconnect,
}: ConnectionCardProps) {
  const isConnected = connection && connection.status !== "revoked";
  const statusStyle = isConnected
    ? STATUS_COLORS[connection.status] ?? STATUS_COLORS.active
    : null;

  return (
    <div
      style={{
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        padding: 16,
        background: "var(--bg-surface)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 8,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            {provider.displayName}
          </h3>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              color: "var(--text-secondary)",
              lineHeight: 1.4,
            }}
          >
            {provider.description}
          </p>
        </div>
      </div>

      {/* Target layers */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
        {provider.targetLayers.map((layer) => (
          <span
            key={layer}
            style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 4,
              background: "var(--bg-surface-raised)",
              color: "var(--text-secondary)",
              textTransform: "capitalize",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            {layer}
          </span>
        ))}
      </div>

      {/* Status + Actions */}
      {isConnected ? (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                padding: "3px 8px",
                borderRadius: 4,
                background: statusStyle?.bg,
                color: statusStyle?.text,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: statusStyle?.dot,
                  display: "inline-block",
                }}
              />
              {connection.status}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono), monospace" }}>
              {formatLastSync(connection.last_sync_at)}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {onSync && (
              <button
                onClick={onSync}
                disabled={isSyncing || connection.status === "error"}
                style={{
                  flex: 1,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  border: "1px solid var(--border-default)",
                  borderRadius: 6,
                  background: "var(--bg-surface)",
                  cursor:
                    isSyncing || connection.status === "error"
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    isSyncing || connection.status === "error" ? 0.5 : 1,
                  color: "var(--text-secondary)",
                }}
              >
                {isSyncing ? "Syncing..." : "Sync now"}
              </button>
            )}
            {onDisconnect && (
              <button
                onClick={onDisconnect}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  border: "1px solid #FECACA",
                  borderRadius: 6,
                  background: "var(--bg-surface)",
                  cursor: "pointer",
                  color: "var(--error)",
                }}
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={onConnect}
          style={{
            width: "100%",
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 500,
            border: "none",
            borderRadius: 6,
            background: "var(--accent-emphasis)",
            color: "var(--text-on-accent)",
            cursor: "pointer",
          }}
        >
          Connect
        </button>
      )}
    </div>
  );
}
