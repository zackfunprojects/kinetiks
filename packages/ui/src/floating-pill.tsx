"use client";

import { useState } from "react";

interface FloatingPillProps {
  codename: string;
  confidenceScore: number;
  currentApp?: string;
}

export function FloatingPill({
  codename,
  confidenceScore,
  currentApp,
}: FloatingPillProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: 24,
        zIndex: 9999,
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: "#6C5CE7",
          color: "#fff",
          border: "none",
          borderRadius: 999,
          padding: "8px 16px",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        {codename} | {confidenceScore}%
      </button>
      {expanded && (
        <div
          style={{
            position: "absolute",
            bottom: 48,
            left: 0,
            background: "#fff",
            borderRadius: 12,
            padding: 16,
            boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
            minWidth: 280,
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>{codename}</p>
          <p style={{ margin: "4px 0 0", color: "#666", fontSize: 13 }}>
            Confidence: {confidenceScore}%
          </p>
          {currentApp && (
            <p style={{ margin: "4px 0 0", color: "#999", fontSize: 12 }}>
              Currently in: {currentApp}
            </p>
          )}
          <a
            href="https://id.kinetiks.ai"
            style={{
              display: "block",
              marginTop: 12,
              color: "#6C5CE7",
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            View full ID
          </a>
        </div>
      )}
    </div>
  );
}
