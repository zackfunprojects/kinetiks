"use client";

import { AppSwitcher } from "./app-switcher";

interface Suggestion {
  suggestion: string;
  estimated_impact: string;
}

interface PendingProposal {
  id: string;
  target_layer: string;
  source_app: string;
  action: string;
}

interface RecentRouting {
  target_app: string;
  relevance_note: string;
  created_at: string;
}

interface ActiveApp {
  name: string;
  displayName: string;
  url: string;
  color?: string;
}

interface InactiveApp {
  name: string;
  displayName: string;
}

interface PillPanelProps {
  codename: string;
  confidenceScore: number;
  currentApp?: string;
  idBaseUrl?: string;
  suggestions: Suggestion[];
  pendingProposals: PendingProposal[];
  recentRoutings: RecentRouting[];
  activeApps: ActiveApp[];
  inactiveApps: InactiveApp[];
}

export function PillPanel({
  codename,
  confidenceScore,
  currentApp,
  idBaseUrl: idBaseUrlProp,
  suggestions,
  pendingProposals,
  recentRoutings,
  activeApps,
  inactiveApps,
}: PillPanelProps) {
  const idBaseUrl =
    idBaseUrlProp ||
    (typeof window !== "undefined" ? window.location.origin : "https://id.kinetiks.ai");

  return (
    <div
      style={{
        position: "absolute",
        bottom: 48,
        left: 0,
        background: "#fff",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
        width: 320,
        maxHeight: "70vh",
        overflowY: "auto",
        opacity: 1,
        transform: "translateY(0)",
        transition: "opacity 0.2s, transform 0.2s",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 16px 12px",
          borderBottom: "1px solid #F3F4F6",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: `conic-gradient(#6C5CE7 ${confidenceScore * 3.6}deg, #E5E7EB 0deg)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              color: "#6C5CE7",
            }}
          >
            {confidenceScore}%
          </div>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>
            {codename}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "#999" }}>
            Your Kinetiks ID
          </p>
        </div>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #F3F4F6" }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Suggestions
          </p>
          {suggestions.slice(0, 3).map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                padding: "4px 0",
              }}
            >
              <p style={{ margin: 0, fontSize: 12, color: "#4B5563", lineHeight: 1.3, flex: 1 }}>
                {s.suggestion}
              </p>
              <span style={{ fontSize: 11, color: "#6C5CE7", fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>
                {s.estimated_impact}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Pending proposals */}
      {pendingProposals.length > 0 && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #F3F4F6" }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Pending ({pendingProposals.length})
          </p>
          {pendingProposals.slice(0, 3).map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 0",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  padding: "1px 5px",
                  background: "#F0EDFF",
                  color: "#6C5CE7",
                  borderRadius: 4,
                  fontWeight: 500,
                }}
              >
                {p.target_layer}
              </span>
              <span style={{ fontSize: 12, color: "#4B5563" }}>
                {p.action}{p.source_app ? ` from ${p.source_app.replace("_", " ")}` : ""}
              </span>
            </div>
          ))}
          {pendingProposals.length > 3 && (
            <a
              href={idBaseUrl}
              style={{ fontSize: 11, color: "#6C5CE7", textDecoration: "none", display: "block", marginTop: 4 }}
            >
              View all {pendingProposals.length} items
            </a>
          )}
        </div>
      )}

      {/* Recent learnings */}
      {recentRoutings.length > 0 && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #F3F4F6" }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Recent Learnings
          </p>
          {recentRoutings.slice(0, 3).map((r, i) => (
            <p key={i} style={{ margin: "3px 0", fontSize: 12, color: "#4B5563" }}>
              {r.relevance_note || `Routed to ${r.target_app.replace("_", " ")}`}
            </p>
          ))}
        </div>
      )}

      {/* App switcher */}
      {(activeApps.length > 0 || inactiveApps.length > 0) && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #F3F4F6" }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Apps
          </p>
          <AppSwitcher
            activeApps={activeApps}
            inactiveApps={inactiveApps}
            currentApp={currentApp}
          />
        </div>
      )}

      {/* Footer links */}
      <div
        style={{
          padding: "10px 16px",
          display: "flex",
          gap: 16,
        }}
      >
        <a
          href={idBaseUrl}
          style={{ fontSize: 12, color: "#6C5CE7", textDecoration: "none", fontWeight: 500 }}
        >
          View full ID
        </a>
        <a
          href={`${idBaseUrl}/billing`}
          style={{ fontSize: 12, color: "#6C5CE7", textDecoration: "none", fontWeight: 500 }}
        >
          Billing
        </a>
        <a
          href={`${idBaseUrl}/connections`}
          style={{ fontSize: 12, color: "#6C5CE7", textDecoration: "none", fontWeight: 500 }}
        >
          Connections
        </a>
      </div>
    </div>
  );
}
