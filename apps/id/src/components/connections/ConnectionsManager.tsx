"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Nango from "@nangohq/frontend";
import type { ConnectionPublic, ProviderDefinition } from "@kinetiks/types";

import { ConnectionCard } from "./ConnectionCard";

/**
 * Phase 7 — Connections page driven by Nango Connect.
 *
 * Replaces the legacy per-provider OAuth redirect + API key modal +
 * GA4 property picker. The new flow:
 *
 *   1. Click "Connect" → POST /api/connections returns a Nango
 *      Connect session token.
 *   2. `nango.openConnectUI({ sessionToken })` opens the Nango Connect
 *      modal. Nango handles OAuth, API-key forms, provider-specific
 *      prompts (HubSpot portal id, GA4 property picker, etc.) in one
 *      modal.
 *   3. On success Nango fires a `connection.created` webhook → our
 *      auth handler upserts `kinetiks_connections`. The frontend
 *      polls /api/connections for a few seconds to surface the new
 *      row inline.
 *
 * Disconnect → DELETE /api/connections/[id] which calls
 * nango.deleteConnection internally.
 *
 * The Nango public key is exposed at NEXT_PUBLIC_NANGO_PUBLIC_KEY;
 * the secret key never reaches the frontend bundle.
 */

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

const POLL_INTERVAL_MS = 1000;
const POLL_MAX_ATTEMPTS = 8;

interface ConnectSessionResponse {
  session_token: string;
  expires_at: string;
  provider: string;
  nango_integration_id: string;
}

export function ConnectionsManager({
  initialConnections,
  providers,
}: ConnectionsManagerProps) {
  const [connections, setConnections] =
    useState<ConnectionPublic[]>(initialConnections);
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const nangoRef = useRef<Nango | null>(null);

  useEffect(() => {
    if (nangoRef.current) return;
    const publicKey = process.env.NEXT_PUBLIC_NANGO_PUBLIC_KEY;
    if (!publicKey) {
      console.warn(
        "[ConnectionsManager] NEXT_PUBLIC_NANGO_PUBLIC_KEY is not set; the Connect button will fail",
      );
      return;
    }
    nangoRef.current = new Nango({
      publicKey,
      host: process.env.NEXT_PUBLIC_NANGO_HOST ?? "https://api.nango.dev",
    });
  }, []);

  const refreshConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/connections");
      if (!res.ok) return;
      const json = await res.json();
      const data = json.data ?? json;
      setConnections((data.connections ?? []) as ConnectionPublic[]);
    } catch {
      // Silent on refresh; user still sees the initial data.
    }
  }, []);

  /**
   * After Nango's modal fires `connect`, poll /api/connections for up
   * to ~8 seconds waiting for the auth webhook to land. The webhook is
   * usually faster than 2s; we cap so the spinner doesn't run forever
   * if something is misconfigured.
   */
  const pollForProvider = useCallback(
    async (provider: string) => {
      setPending((prev) => new Set(prev).add(provider));
      try {
        for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          const res = await fetch("/api/connections");
          if (!res.ok) continue;
          const json = await res.json();
          const data = json.data ?? json;
          const list = (data.connections ?? []) as ConnectionPublic[];
          const found = list.find(
            (c) => c.provider === provider && c.status !== "revoked",
          );
          if (found) {
            setConnections(list);
            setToast({ message: `Connected to ${provider}`, type: "success" });
            return;
          }
        }
        setToast({
          message: `${provider} connection didn't appear after a few seconds. Refreshing.`,
          type: "error",
        });
        await refreshConnections();
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(provider);
          return next;
        });
      }
    },
    [refreshConnections],
  );

  const handleConnect = useCallback(
    async (provider: ProviderDefinition) => {
      const nango = nangoRef.current;
      if (!nango) {
        setToast({
          message: "Connect SDK isn't loaded. Refresh and try again.",
          type: "error",
        });
        return;
      }

      let session: ConnectSessionResponse;
      try {
        const res = await fetch("/api/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: provider.provider }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          setToast({
            message: json.error ?? "Couldn't start the connect flow",
            type: "error",
          });
          return;
        }
        session = (json.data ?? json) as ConnectSessionResponse;
      } catch {
        setToast({
          message: "Couldn't start the connect flow",
          type: "error",
        });
        return;
      }

      try {
        const result = await nango.openConnectUI({
          sessionToken: session.session_token,
          onEvent: (event) => {
            // Nango fires multiple events; we react to `connect` (success)
            // and close. Errors are reported via the onEvent payload.
            if (event.type === "connect") {
              void pollForProvider(provider.provider);
            }
          },
        });
        // `result` is the final modal outcome — if the user cancels
        // before completing, the modal closes without firing `connect`.
        if (!result) return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setToast({ message: msg, type: "error" });
      }
    },
    [pollForProvider],
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
        const json = await res.json();
        if (!res.ok || !json.success) {
          setToast({ message: json.error ?? "Sync failed", type: "error" });
          return;
        }
        setToast({ message: "Sync triggered - data should arrive shortly", type: "success" });
        // Sync runs async; refresh after a short delay so last_sync_at
        // catches up.
        setTimeout(() => void refreshConnections(), 3000);
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
    [refreshConnections],
  );

  const handleDisconnect = useCallback(
    async (connectionId: string, provider: string) => {
      if (!confirm(`Disconnect ${provider}? This will revoke access immediately.`))
        return;
      try {
        const res = await fetch(`/api/connections/${connectionId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setToast({
            message: data.error ?? "Failed to disconnect",
            type: "error",
          });
          return;
        }
        setToast({ message: `Disconnected ${provider}`, type: "success" });
        await refreshConnections();
      } catch {
        setToast({ message: "Failed to disconnect", type: "error" });
      }
    },
    [refreshConnections],
  );

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div
          role="alert"
          style={{
            padding: "10px 16px",
            marginBottom: 16,
            borderRadius: 6,
            fontSize: 13,
            background:
              toast.type === "success"
                ? "var(--kt-success-soft)"
                : "var(--kt-danger-soft)",
            color:
              toast.type === "success" ? "var(--kt-success)" : "var(--kt-danger)",
            border: `1px solid ${toast.type === "success" ? "var(--kt-success)" : "var(--kt-danger)"}`,
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
            aria-label="Dismiss"
          >
            x
          </button>
        </div>
      )}

      {/* Categories */}
      {CATEGORY_ORDER.map((category) => {
        const categoryProviders = providers.filter(
          (p) => p.category === category,
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
                color: "var(--kt-fg-3)",
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
                  (c) => c.provider === provider.provider,
                );
                return (
                  <ConnectionCard
                    key={provider.provider}
                    provider={provider}
                    connection={connection ?? null}
                    isSyncing={
                      connection ? syncing.has(connection.id) : false
                    }
                    isPending={pending.has(provider.provider)}
                    onConnect={() => handleConnect(provider)}
                    onSync={
                      connection
                        ? () => handleSync(connection.id)
                        : undefined
                    }
                    onDisconnect={
                      connection
                        ? () =>
                            handleDisconnect(connection.id, provider.displayName)
                        : undefined
                    }
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
