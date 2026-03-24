"use client";

import { useState, useEffect, useRef } from "react";
import { PillPanel } from "./pill-panel";

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

interface FloatingPillProps {
  codename: string;
  confidenceScore: number;
  currentApp?: string;
  suggestions?: Suggestion[];
  pendingProposals?: PendingProposal[];
  recentRoutings?: RecentRouting[];
  activeApps?: ActiveApp[];
  inactiveApps?: InactiveApp[];
}

export function FloatingPill({
  codename,
  confidenceScore,
  currentApp,
  suggestions = [],
  pendingProposals = [],
  recentRoutings = [],
  activeApps = [],
  inactiveApps = [],
}: FloatingPillProps) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!expanded) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setExpanded(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expanded]);

  const hasPending = pendingProposals.length > 0;

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        bottom: 24,
        left: 24,
        zIndex: 9999,
      }}
    >
      {/* Collapsed pill button */}
      <button
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: hovered ? "#5B4BD5" : "#6C5CE7",
          color: "#fff",
          border: "none",
          borderRadius: 999,
          padding: "8px 16px",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 500,
          boxShadow: "0 4px 16px rgba(108,92,231,0.3)",
          transition: "background 0.15s, transform 0.15s, box-shadow 0.15s",
          transform: hovered ? "scale(1.03)" : "scale(1)",
          position: "relative",
        }}
      >
        <span style={{ fontWeight: 700, letterSpacing: -0.3 }}>K</span>
        <span>{codename}</span>
        <span
          style={{
            padding: "1px 6px",
            background: "rgba(255,255,255,0.2)",
            borderRadius: 999,
            fontSize: 11,
          }}
        >
          {confidenceScore}%
        </span>

        {/* Pending notification dot */}
        {hasPending && (
          <div
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#EF4444",
              border: "2px solid #fff",
            }}
          />
        )}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <PillPanel
          codename={codename}
          confidenceScore={confidenceScore}
          currentApp={currentApp}
          suggestions={suggestions}
          pendingProposals={pendingProposals}
          recentRoutings={recentRoutings}
          activeApps={activeApps}
          inactiveApps={inactiveApps}
        />
      )}
    </div>
  );
}
