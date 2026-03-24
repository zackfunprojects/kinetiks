"use client";

import Link from "next/link";
import type { GapFinding } from "@/lib/archivist/types";
import { LAYER_DISPLAY_NAMES } from "@/lib/utils/layer-display";

interface SuggestionsListProps {
  findings: GapFinding[];
}

const SEVERITY_STYLES: Record<string, { dot: string; label: string }> = {
  empty: { dot: "var(--error)", label: "Missing" },
  thin: { dot: "var(--warning)", label: "Incomplete" },
  stale: { dot: "var(--text-tertiary)", label: "Stale" },
};

export function SuggestionsList({ findings }: SuggestionsListProps) {
  if (findings.length === 0) {
    return (
      <p style={{ color: "var(--text-tertiary)", fontSize: 13, padding: "8px 0" }}>
        No suggestions right now. Your ID is looking good.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {findings.slice(0, 5).map((finding, i) => {
        const severity = SEVERITY_STYLES[finding.severity] || SEVERITY_STYLES.thin;
        return (
          <Link
            key={`${finding.layer}-${i}`}
            href={`/context/${finding.layer}`}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "8px 12px",
              borderRadius: 6,
              background: "var(--bg-surface-raised)",
              textDecoration: "none",
              transition: "background 0.15s, border-color 0.15s",
              border: "1px solid transparent",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-surface-overlay)";
              e.currentTarget.style.borderColor = "var(--border-default)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-surface-raised)";
              e.currentTarget.style.borderColor = "transparent";
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: severity.dot,
                marginTop: 6,
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                {finding.suggestion}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono), monospace" }}>
                  {LAYER_DISPLAY_NAMES[finding.layer]}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--accent)",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono), monospace",
                  }}
                >
                  {finding.estimated_impact}
                </span>
              </div>
            </div>
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-tertiary)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0, marginTop: 4 }}
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        );
      })}
    </div>
  );
}
