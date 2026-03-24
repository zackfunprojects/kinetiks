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
          <div
            key={`${finding.layer}-${i}`}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "8px 12px",
              borderRadius: 6,
              background: "var(--bg-surface-raised)",
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
          </div>
        );
      })}
    </div>
  );
}
