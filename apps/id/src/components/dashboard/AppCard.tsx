"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface AppCardProps {
  appName: string;
  displayName: string;
  description: string;
  url: string;
  color: string;
  isActive: boolean;
  status?: string;
  onActivate: (appName: string) => void;
}

export function AppCard({
  appName,
  displayName,
  description,
  url,
  color,
  isActive,
  status,
  onActivate,
}: AppCardProps) {
  const [activating, setActivating] = useState(false);

  async function handleActivate() {
    setActivating(true);
    try {
      const res = await fetch("/api/account/activate-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_name: appName }),
      });
      if (res.ok) {
        onActivate(appName);
      }
    } finally {
      setActivating(false);
    }
  }

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            background: color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-on-accent)",
            fontWeight: 700,
            fontSize: 14,
            fontFamily: "var(--font-mono), monospace",
          }}
        >
          {displayName[0]}
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
            {displayName}
          </h4>
        </div>
        {isActive && status && (
          <Badge
            label={status}
            variant={status === "active" ? "success" : status === "paused" ? "warning" : "default"}
          />
        )}
      </div>

      <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>
        {description}
      </p>

      {isActive ? (
        <a
          href={url}
          style={{
            display: "inline-block",
            padding: "6px 14px",
            background: "var(--accent-emphasis)",
            color: "var(--text-on-accent)",
            borderRadius: 6,
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
          disabled={activating}
          style={{
            padding: "6px 14px",
            background: "transparent",
            color: "var(--accent)",
            border: "1px solid var(--accent)",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor: activating ? "not-allowed" : "pointer",
            opacity: activating ? 0.5 : 1,
          }}
        >
          {activating ? "Activating..." : "Activate"}
        </button>
      )}
    </Card>
  );
}
