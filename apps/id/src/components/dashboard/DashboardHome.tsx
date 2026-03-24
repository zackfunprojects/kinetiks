"use client";

import { useState } from "react";
import type { Proposal, LedgerEntry, AppActivation, ConnectionPublic } from "@kinetiks/types";
import type { ConfidenceScores } from "@/lib/cortex/confidence";
import type { GapFinding } from "@/lib/archivist/types";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { Card } from "@/components/ui/Card";
import { PendingProposalCard } from "./PendingProposalCard";
import { AppCard } from "./AppCard";
import { ActivityTimeline } from "./ActivityTimeline";
import { SuggestionsList } from "./SuggestionsList";
import { APP_REGISTRY } from "@/lib/utils/app-registry";

interface DashboardHomeProps {
  codename: string;
  confidence: ConfidenceScores;
  escalatedProposals: Proposal[];
  recentActivity: LedgerEntry[];
  suggestions: GapFinding[];
  connections: ConnectionPublic[];
  appActivations: AppActivation[];
}

export function DashboardHome({
  codename,
  confidence,
  escalatedProposals: initialProposals,
  recentActivity,
  suggestions,
  connections,
  appActivations: initialActivations,
}: DashboardHomeProps) {
  const [proposals, setProposals] = useState(initialProposals);
  const [activations, setActivations] = useState(initialActivations);

  function handleProposalDecision(id: string) {
    setProposals((prev) => prev.filter((p) => p.id !== id));
  }

  function handleAppActivate(appName: string) {
    setActivations((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        account_id: "",
        app_name: appName,
        status: "active",
        activated_at: new Date().toISOString(),
      } as AppActivation,
    ]);
  }

  const activeAppNames = new Set<string>(
    activations.filter((a) => a.status === "active").map((a) => a.app_name)
  );

  const apps = Object.values(APP_REGISTRY);

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1a1a2e" }}>
          Dashboard
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "#666" }}>
          Welcome back, {codename}
        </p>
      </div>

      {/* Top row: Confidence + Suggestions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 24,
          marginBottom: 24,
        }}
      >
        <Card
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: 28,
            minWidth: 200,
          }}
        >
          <ConfidenceRing score={confidence.aggregate} size={160} strokeWidth={10} />
          <p
            style={{
              margin: "16px 0 0",
              fontSize: 16,
              fontWeight: 600,
              color: "#1a1a2e",
              textAlign: "center",
            }}
          >
            {codename}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#999" }}>
            Your Kinetiks ID
          </p>
        </Card>

        <Card>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>
            Suggestions
          </h3>
          <SuggestionsList findings={suggestions} />
        </Card>
      </div>

      {/* Pending proposals */}
      {proposals.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>
            Pending Items ({proposals.length})
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
            {proposals.map((p) => (
              <PendingProposalCard
                key={p.id}
                proposal={p}
                onDecision={handleProposalDecision}
              />
            ))}
          </div>
        </div>
      )}

      {/* App launcher */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>
          Apps
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {apps.map((app) => {
            const activation = activations.find((a) => a.app_name === app.name);
            return (
              <AppCard
                key={app.name}
                appName={app.name}
                displayName={app.displayName}
                description={app.description}
                url={app.url}
                color={app.color}
                isActive={activeAppNames.has(app.name)}
                status={activation?.status}
                onActivate={handleAppActivate}
              />
            );
          })}
        </div>
      </div>

      {/* Bottom row: Activity + Connections */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
        }}
      >
        <Card>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>
            Recent Activity
          </h3>
          <ActivityTimeline entries={recentActivity.slice(0, 10)} />
        </Card>

        <Card>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>
            Connected Sources
          </h3>
          {connections.length === 0 ? (
            <p style={{ color: "#999", fontSize: 13 }}>
              No data sources connected yet.{" "}
              <a href="/connections" style={{ color: "#6C5CE7", textDecoration: "none" }}>
                Connect one
              </a>
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    borderBottom: "1px solid #F3F4F6",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background:
                          conn.status === "active"
                            ? "#10B981"
                            : conn.status === "error"
                            ? "#EF4444"
                            : "#9CA3AF",
                      }}
                    />
                    <span style={{ fontSize: 13, color: "#374151", textTransform: "capitalize" }}>
                      {conn.provider.replace("_", " ")}
                    </span>
                  </div>
                  {conn.last_sync_at && (
                    <span style={{ fontSize: 11, color: "#999" }}>
                      Last sync: {new Date(conn.last_sync_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
