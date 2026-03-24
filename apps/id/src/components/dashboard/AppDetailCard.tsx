"use client";

import { useState } from "react";
import type { AppActivation, SynapseRecord } from "@kinetiks/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LAYER_DISPLAY_NAMES } from "@/lib/utils/layer-display";
import type { ContextLayer } from "@kinetiks/types";

interface AppDetailCardProps {
  appName: string;
  displayName: string;
  description: string;
  url: string;
  color: string;
  activation: AppActivation | null;
  synapse: SynapseRecord | null;
  onActivate: (appName: string) => void;
}

export function AppDetailCard({
  appName,
  displayName,
  description,
  url,
  color,
  activation,
  synapse,
  onActivate,
}: AppDetailCardProps) {
  const [loading, setLoading] = useState(false);
  const isActive = activation?.status === "active";

  async function handleActivate() {
    setLoading(true);
    try {
      const res = await fetch("/api/account/activate-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_name: appName }),
      });
      if (res.ok) onActivate(appName);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {displayName[0]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#1a1a2e" }}>
              {displayName}
            </h3>
            {isActive && (
              <Badge label="Active" variant="success" />
            )}
            {activation?.status === "paused" && (
              <Badge label="Paused" variant="warning" />
            )}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666", lineHeight: 1.4 }}>
            {description}
          </p>
        </div>
      </div>

      {isActive && synapse && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "#999" }}>Synapse:</span>
            <Badge
              label={synapse.status}
              variant={synapse.status === "active" ? "success" : "error"}
            />
          </div>

          {synapse.read_layers.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "#999" }}>Reads: </span>
              {synapse.read_layers.map((l) => (
                <Badge
                  key={l}
                  label={LAYER_DISPLAY_NAMES[l as ContextLayer] || l}
                  variant="default"
                />
              ))}
            </div>
          )}

          {synapse.write_layers.length > 0 && (
            <div>
              <span style={{ fontSize: 11, color: "#999" }}>Writes: </span>
              {synapse.write_layers.map((l) => (
                <Badge
                  key={l}
                  label={LAYER_DISPLAY_NAMES[l as ContextLayer] || l}
                  variant="purple"
                />
              ))}
            </div>
          )}

          {activation.activated_at && (
            <p style={{ margin: "8px 0 0", fontSize: 11, color: "#999" }}>
              Activated {new Date(activation.activated_at).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {isActive ? (
          <a
            href={url}
            style={{
              padding: "8px 16px",
              background: color,
              color: "#fff",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Open {displayName}
          </a>
        ) : (
          <button
            onClick={handleActivate}
            disabled={loading}
            style={{
              padding: "8px 16px",
              background: "#6C5CE7",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Activating..." : "Activate"}
          </button>
        )}
      </div>
    </Card>
  );
}
