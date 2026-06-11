"use client";

/**
 * System connection card — Cortex → Integrations → System Connections.
 *
 * D1: these cards grew connect/disconnect affordances (they were
 * display-only). Connect is a plain navigation to the direct-OAuth
 * start route; the provider redirects back to the integrations page
 * with a `system_connect` banner param. Disconnect mirrors the
 * ConnectionsManager convention (confirm → DELETE → refresh).
 *
 * When the deployment lacks the provider's OAuth client credentials
 * the card says so honestly instead of rendering a dead button.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Card, StatusPill } from "@kinetiks/ui";
import type { ConnectionStatus, SystemConnectionProvider } from "@kinetiks/types";

export interface SystemConnectionCardProps {
  provider: SystemConnectionProvider;
  /** Card title, e.g. "Email". */
  label: string;
  /** Shown when not connected (what connecting enables). */
  description: string;
  /** Whether this deployment has the provider's OAuth client configured. */
  configured: boolean;
  /** The live (non-revoked) connection, if any. */
  connection: {
    id: string;
    status: ConnectionStatus;
    /** e.g. the connected address / workspace name. */
    detail: string | null;
  } | null;
}

const DISCONNECT_ERROR = "We couldn't disconnect that. Try again in a moment.";

export function SystemConnectionCard({
  provider,
  label,
  description,
  configured,
  connection,
}: SystemConnectionCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startConnect = useCallback(() => {
    setBusy(true);
    window.location.assign(`/api/connections/system/${provider}/start`);
  }, [provider]);

  const disconnect = useCallback(async () => {
    if (!connection) return;
    if (!window.confirm(`Disconnect ${label}? This will revoke access immediately.`)) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/connections/${connection.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setErrorMessage(DISCONNECT_ERROR);
        return;
      }
      router.refresh();
    } catch {
      setErrorMessage(DISCONNECT_ERROR);
    } finally {
      setBusy(false);
    }
  }, [connection, label, router]);

  const status: ConnectionStatus | "none" = connection?.status ?? "none";

  const pill =
    status === "active" ? (
      <StatusPill tone="success">Connected</StatusPill>
    ) : status === "error" ? (
      <StatusPill tone="warning">Needs attention</StatusPill>
    ) : status === "pending" ? (
      <StatusPill tone="neutral">Pending</StatusPill>
    ) : (
      <StatusPill tone="neutral">Not connected</StatusPill>
    );

  const body =
    status === "active" && connection?.detail
      ? connection.detail
      : status === "error"
        ? "The connection stopped working. Reconnect to restore it."
        : description;

  return (
    <Card variant="muted">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--kt-s-2)",
        }}
      >
        <span className="kt-card-title">{label}</span>
        {pill}
      </div>
      <p className="kt-small" style={{ margin: "0 0 var(--kt-s-3)" }}>
        {body}
      </p>
      {!configured && status === "none" ? (
        <p className="kt-small" style={{ margin: 0, color: "var(--kt-fg-3)" }}>
          Not configured for this deployment yet.
        </p>
      ) : status === "active" || status === "pending" ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void disconnect();
          }}
          loading={busy}
          disabled={busy}
          aria-label={`Disconnect ${label}`}
        >
          Disconnect
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={startConnect}
          loading={busy}
          disabled={busy}
          aria-label={`${status === "error" ? "Reconnect" : "Connect"} ${label}`}
        >
          {status === "error" ? "Reconnect" : "Connect"}
        </Button>
      )}
      {errorMessage ? (
        <p
          className="kt-small"
          role="alert"
          style={{ margin: "var(--kt-s-2) 0 0", color: "var(--kt-danger)" }}
        >
          {errorMessage}
        </p>
      ) : null}
    </Card>
  );
}
