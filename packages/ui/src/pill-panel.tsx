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

const sectionHeader: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 11,
  fontWeight: 600,
  fontFamily: "var(--font-mono, monospace), monospace",
  color: "var(--text-tertiary, #484f58)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const sectionBorder = "1px solid var(--border-muted, #21262d)";

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
  const idBaseUrl: string =
    idBaseUrlProp ||
    (typeof window !== "undefined" ? window.location.origin : "https://id.kinetiks.ai");

  return (
    <div
      style={{
        position: "absolute",
        bottom: 48,
        left: 0,
        background: "var(--bg-surface-overlay, #2d333b)",
        borderRadius: 8,
        border: "1px solid var(--border-default, #30363d)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
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
          borderBottom: sectionBorder,
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
            background: `conic-gradient(var(--accent, #3fb950) ${confidenceScore * 3.6}deg, var(--border-default, #30363d) 0deg)`,
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
              background: "var(--bg-surface-overlay, #2d333b)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "var(--font-mono, monospace), monospace",
              color: "var(--accent, #3fb950)",
            }}
          >
            {confidenceScore}%
          </div>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, fontFamily: "var(--font-mono, monospace), monospace", color: "var(--text-primary, #e6edf3)" }}>
            {codename}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 11, fontFamily: "var(--font-mono, monospace), monospace", color: "var(--text-tertiary, #484f58)" }}>
            Your Kinetiks ID
          </p>
        </div>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div style={{ padding: "12px 16px", borderBottom: sectionBorder }}>
          <p style={sectionHeader}>Suggestions</p>
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
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary, #8b949e)", lineHeight: 1.3, flex: 1 }}>
                {s.suggestion}
              </p>
              <span style={{ fontSize: 11, color: "var(--accent, #3fb950)", fontWeight: 600, fontFamily: "var(--font-mono, monospace), monospace", flexShrink: 0, marginLeft: 8 }}>
                {s.estimated_impact}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Pending proposals */}
      {pendingProposals.length > 0 && (
        <div style={{ padding: "12px 16px", borderBottom: sectionBorder }}>
          <p style={sectionHeader}>Pending ({pendingProposals.length})</p>
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
                  background: "var(--accent-muted, rgba(63,185,80,0.15))",
                  color: "var(--accent, #3fb950)",
                  borderRadius: 4,
                  fontWeight: 500,
                  fontFamily: "var(--font-mono, monospace), monospace",
                }}
              >
                {p.target_layer}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-secondary, #8b949e)" }}>
                {p.action}{p.source_app ? ` from ${p.source_app.replace("_", " ")}` : ""}
              </span>
            </div>
          ))}
          {pendingProposals.length > 3 && (
            <a
              href={idBaseUrl}
              style={{ fontSize: 11, color: "var(--accent, #3fb950)", textDecoration: "none", display: "block", marginTop: 4, fontFamily: "var(--font-mono, monospace), monospace" }}
            >
              View all {pendingProposals.length} items
            </a>
          )}
        </div>
      )}

      {/* Recent learnings */}
      {recentRoutings.length > 0 && (
        <div style={{ padding: "12px 16px", borderBottom: sectionBorder }}>
          <p style={sectionHeader}>Recent Learnings</p>
          {recentRoutings.slice(0, 3).map((r, i) => (
            <p key={i} style={{ margin: "3px 0", fontSize: 12, color: "var(--text-secondary, #8b949e)" }}>
              {r.relevance_note || `Routed to ${r.target_app.replace("_", " ")}`}
            </p>
          ))}
        </div>
      )}

      {/* App switcher */}
      {(activeApps.length > 0 || inactiveApps.length > 0) && (
        <div style={{ padding: "12px 16px", borderBottom: sectionBorder }}>
          <p style={sectionHeader}>Apps</p>
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
          style={{ fontSize: 12, color: "var(--accent, #3fb950)", textDecoration: "none", fontWeight: 500, fontFamily: "var(--font-mono, monospace), monospace" }}
        >
          view_id
        </a>
        <a
          href={`${idBaseUrl}/billing`}
          style={{ fontSize: 12, color: "var(--accent, #3fb950)", textDecoration: "none", fontWeight: 500, fontFamily: "var(--font-mono, monospace), monospace" }}
        >
          billing
        </a>
        <a
          href={`${idBaseUrl}/connections`}
          style={{ fontSize: 12, color: "var(--accent, #3fb950)", textDecoration: "none", fontWeight: 500, fontFamily: "var(--font-mono, monospace), monospace" }}
        >
          connections
        </a>
      </div>
    </div>
  );
}
