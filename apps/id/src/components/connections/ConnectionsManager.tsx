"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { ConnectionPublic, ProviderDefinition } from "@kinetiks/types";
import { ConnectionCard } from "./ConnectionCard";
import { ApiKeyModal } from "./ApiKeyModal";

interface ConnectionsManagerProps {
  initialConnections: ConnectionPublic[];
  providers: ProviderDefinition[];
}

const CATEGORY_ORDER = [
  "analytics",
  "revenue",
  "crm",
  "social",
  "email",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  analytics: "Analytics",
  revenue: "Revenue",
  crm: "CRM",
  social: "Social",
  email: "Email",
};

export function ConnectionsManager({
  initialConnections,
  providers,
}: ConnectionsManagerProps) {
  const [connections, setConnections] =
    useState<ConnectionPublic[]>(initialConnections);
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [apiKeyModal, setApiKeyModal] = useState<ProviderDefinition | null>(
    null
  );
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const searchParams = useSearchParams();

  // Handle success/error from OAuth callback redirect
  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success) {
      setToast({ message: `Connected to ${success}`, type: "success" });
      // Refresh connections list
      refreshConnections();
    } else if (error) {
      const detail = searchParams.get("detail") ?? error;
      setToast({
        message: `Connection failed: ${detail}`,
        type: "error",
      });
    }
  }, [searchParams]);

  const refreshConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/connections");
      if (res.ok) {
        const data = (await res.json()) as {
          connections: ConnectionPublic[];
        };
        setConnections(data.connections);
      }
    } catch {
      // Silently fail on refresh - user still sees initial data
    }
  }, []);

  const handleConnect = useCallback(
    async (provider: ProviderDefinition) => {
      if (provider.authType === "api_key") {
        setApiKeyModal(provider);
        return;
      }

      // OAuth flow - request the authorization URL from the API
      try {
        const res = await fetch("/api/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: provider.provider }),
        });

        if (!res.ok) {
          const data = (await res.json()) as { error: string };
          setToast({ message: data.error, type: "error" });
          return;
        }

        const data = (await res.json()) as { authorization_url: string };
        window.location.href = data.authorization_url;
      } catch {
        setToast({
          message: "Failed to start connection flow",
          type: "error",
        });
      }
    },
    []
  );

  const handleApiKeySubmit = useCallback(
    async (provider: string, apiKey: string) => {
      try {
        const res = await fetch("/api/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, api_key: apiKey }),
        });

        if (!res.ok) {
          const data = (await res.json()) as { error: string };
          setToast({ message: data.error, type: "error" });
          return;
        }

        setApiKeyModal(null);
        setToast({ message: `Connected to ${provider}`, type: "success" });
        await refreshConnections();
      } catch {
        setToast({ message: "Failed to save API key", type: "error" });
      }
    },
    [refreshConnections]
  );

  const handleSync = useCallback(
    async (connectionId: string) => {
      setSyncing((prev) => new Set(prev).add(connectionId));
      try {
        const res = await fetch(`/api/connections/${connectionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sync" }),
        });

        if (!res.ok) {
          const data = (await res.json()) as { error: string };
          setToast({ message: data.error, type: "error" });
          return;
        }

        const data = (await res.json()) as {
          result: {
            success: boolean;
            proposals_generated: number;
            error: string | null;
          };
        };

        if (data.result.success) {
          setToast({
            message: `Synced - ${data.result.proposals_generated} proposals generated`,
            type: "success",
          });
        } else {
          setToast({
            message: data.result.error ?? "Sync failed",
            type: "error",
          });
        }

        await refreshConnections();
      } catch {
        setToast({ message: "Sync failed", type: "error" });
      } finally {
        setSyncing((prev) => {
          const next = new Set(prev);
          next.delete(connectionId);
          return next;
        });
      }
    },
    [refreshConnections]
  );

  const handleDisconnect = useCallback(
    async (connectionId: string, provider: string) => {
      if (!confirm(`Disconnect ${provider}? This cannot be undone.`)) return;

      try {
        const res = await fetch(`/api/connections/${connectionId}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          const data = (await res.json()) as { error: string };
          setToast({ message: data.error, type: "error" });
          return;
        }

        setToast({ message: `Disconnected ${provider}`, type: "success" });
        await refreshConnections();
      } catch {
        setToast({ message: "Failed to disconnect", type: "error" });
      }
    },
    [refreshConnections]
  );

  // Group providers by category
  const connectedProviders = new Set(connections.map((c) => c.provider));

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div
          style={{
            padding: "10px 16px",
            marginBottom: 16,
            borderRadius: 6,
            fontSize: 13,
            background: toast.type === "success" ? "#ECFDF5" : "#FEF2F2",
            color: toast.type === "success" ? "#065F46" : "#991B1B",
            border: `1px solid ${toast.type === "success" ? "#A7F3D0" : "#FECACA"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 16,
              color: "inherit",
              padding: "0 4px",
            }}
          >
            x
          </button>
        </div>
      )}

      {/* Categories */}
      {CATEGORY_ORDER.map((category) => {
        const categoryProviders = providers.filter(
          (p) => p.category === category
        );
        if (categoryProviders.length === 0) return null;

        return (
          <div key={category} style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#999",
                marginBottom: 12,
              }}
            >
              {CATEGORY_LABELS[category]}
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: 12,
              }}
            >
              {categoryProviders.map((provider) => {
                const connection = connections.find(
                  (c) => c.provider === provider.provider
                );
                return (
                  <ConnectionCard
                    key={provider.provider}
                    provider={provider}
                    connection={connection ?? null}
                    isSyncing={
                      connection ? syncing.has(connection.id) : false
                    }
                    onConnect={() => handleConnect(provider)}
                    onSync={
                      connection
                        ? () => handleSync(connection.id)
                        : undefined
                    }
                    onDisconnect={
                      connection
                        ? () =>
                            handleDisconnect(
                              connection.id,
                              provider.displayName
                            )
                        : undefined
                    }
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* API Key Modal */}
      {apiKeyModal && (
        <ApiKeyModal
          provider={apiKeyModal}
          onSubmit={(key) => handleApiKeySubmit(apiKeyModal.provider, key)}
          onClose={() => setApiKeyModal(null)}
        />
      )}
    </div>
  );
}
