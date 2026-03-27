"use client";

import type { ResearchBrief, ResearchTier } from "@/types/composer";

interface ResearchBriefPanelProps {
  brief: ResearchBrief | null;
  onBriefChange: (brief: ResearchBrief) => void;
  onGenerate: (tier: ResearchTier) => void;
  loading: boolean;
}

export function ResearchBriefPanel({ brief, onBriefChange, onGenerate, loading }: ResearchBriefPanelProps) {
  const labelStyle: React.CSSProperties = {
    fontSize: "0.6875rem",
    fontWeight: 600,
    color: "var(--text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "4px",
    display: "block",
  };

  const textareaStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "6px",
    border: "1px solid var(--border-subtle)",
    backgroundColor: "var(--surface-base)",
    color: "var(--text-primary)",
    fontSize: "0.8125rem",
    resize: "vertical",
    lineHeight: 1.5,
  };

  return (
    <div
      style={{
        backgroundColor: "var(--surface-raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "8px",
        padding: "16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h4 style={{ ...labelStyle, margin: 0 }}>Research Brief</h4>
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            onClick={() => onGenerate("brief")}
            disabled={loading}
            style={{
              padding: "4px 10px",
              borderRadius: "4px",
              border: "1px solid var(--border-default)",
              backgroundColor: "transparent",
              color: "var(--text-secondary)",
              fontSize: "0.6875rem",
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            Brief
          </button>
          <button
            onClick={() => onGenerate("deep")}
            disabled={loading}
            style={{
              padding: "4px 10px",
              borderRadius: "4px",
              border: "none",
              backgroundColor: "var(--harvest-green)",
              color: "#fff",
              fontSize: "0.6875rem",
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            Deep
          </button>
        </div>
      </div>

      {loading && (
        <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", padding: "12px 0" }}>
          Generating research brief...
        </p>
      )}

      {!loading && !brief && (
        <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", padding: "12px 0" }}>
          Select a contact and generate a research brief to personalize your email.
        </p>
      )}

      {brief && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div>
            <label htmlFor="rb-summary" style={labelStyle}>Company Summary</label>
            <textarea
              id="rb-summary"
              style={{ ...textareaStyle, minHeight: 60 }}
              value={brief.company_summary}
              onChange={(e) => onBriefChange({ ...brief, company_summary: e.target.value })}
            />
          </div>
          <div>
            <label style={labelStyle}>Personalization Hooks</label>
            {brief.personalization_hooks.map((hook, i) => (
              <input
                key={i}
                type="text"
                aria-label={`Personalization hook ${i + 1}`}
                value={hook}
                onChange={(e) => {
                  const hooks = [...brief.personalization_hooks];
                  hooks[i] = e.target.value;
                  onBriefChange({ ...brief, personalization_hooks: hooks });
                }}
                style={{
                  ...textareaStyle,
                  marginBottom: "4px",
                  resize: "none",
                }}
              />
            ))}
          </div>
          <div>
            <label htmlFor="rb-angle" style={labelStyle}>Relevance Angle</label>
            <textarea
              id="rb-angle"
              style={{ ...textareaStyle, minHeight: 40 }}
              value={brief.relevance_angle}
              onChange={(e) => onBriefChange({ ...brief, relevance_angle: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
