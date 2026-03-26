"use client";

import type { EmailStyleConfig, StylePreset } from "@/types/composer";

interface StyleConfiguratorProps {
  style: EmailStyleConfig;
  onChange: (style: EmailStyleConfig) => void;
  presets: StylePreset[];
  onSavePreset: (name: string) => void;
}

export function StyleConfigurator({ style, onChange, presets, onSavePreset }: StyleConfiguratorProps) {
  const update = <K extends keyof EmailStyleConfig>(key: K, value: EmailStyleConfig[K]) => {
    onChange({ ...style, [key]: value });
  };

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 10px",
    borderRadius: "6px",
    border: "1px solid var(--border-subtle)",
    backgroundColor: "var(--surface-base)",
    color: "var(--text-primary)",
    fontSize: "0.8125rem",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "0.6875rem",
    fontWeight: 500,
    color: "var(--text-tertiary)",
    marginBottom: "3px",
    display: "block",
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
      <h4
        style={{
          fontSize: "0.6875rem",
          fontWeight: 600,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "12px",
        }}
      >
        Email Style
      </h4>

      {/* Preset selector */}
      {presets.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <label htmlFor="sc-preset" style={labelStyle}>Preset</label>
          <select
            id="sc-preset"
            style={selectStyle}
            value={presets.find((p) => JSON.stringify(p.config) === JSON.stringify(style))?.id ?? ""}
            onChange={(e) => {
              const preset = presets.find((p) => p.id === e.target.value);
              if (preset) onChange(preset.config);
            }}
          >
            <option value="">Custom</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <div>
          <label htmlFor="sc-tone" style={labelStyle}>Tone</label>
          <select id="sc-tone" style={selectStyle} value={style.tone} onChange={(e) => update("tone", e.target.value as EmailStyleConfig["tone"])}>
            <option value="conversational">Conversational</option>
            <option value="formal">Formal</option>
            <option value="casual">Casual</option>
          </select>
        </div>
        <div>
          <label htmlFor="sc-length" style={labelStyle}>Length</label>
          <select id="sc-length" style={selectStyle} value={style.length} onChange={(e) => update("length", e.target.value as EmailStyleConfig["length"])}>
            <option value="short">Short (2-3 sentences)</option>
            <option value="medium">Medium (3-5 sentences)</option>
            <option value="detailed">Detailed (5-7 sentences)</option>
          </select>
        </div>
        <div>
          <label htmlFor="sc-cta" style={labelStyle}>CTA Style</label>
          <select id="sc-cta" style={selectStyle} value={style.cta_style} onChange={(e) => update("cta_style", e.target.value as EmailStyleConfig["cta_style"])}>
            <option value="quick_question">Quick question</option>
            <option value="meeting_request">Meeting request</option>
            <option value="value_prop">Value proposition</option>
            <option value="soft_intro">Soft intro</option>
          </select>
        </div>
        <div>
          <label htmlFor="sc-greeting" style={labelStyle}>Greeting</label>
          <select id="sc-greeting" style={selectStyle} value={style.greeting_style} onChange={(e) => update("greeting_style", e.target.value as EmailStyleConfig["greeting_style"])}>
            <option value="first_name">First name</option>
            <option value="full_name">Full name</option>
            <option value="title_based">Title-based</option>
          </select>
        </div>
      </div>

      {/* Toggles */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" }}>
        {[
          { key: "include_ps" as const, label: "Include PS line" },
          { key: "reference_cc" as const, label: "Reference CC in body" },
          { key: "address_both_contacts" as const, label: "Address both in greeting" },
          { key: "link_company_in_signature" as const, label: "Link company in signature" },
        ].map(({ key, label }) => (
          <label
            key={key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={style[key]}
              onChange={(e) => update(key, e.target.checked)}
              style={{ accentColor: "var(--accent-primary)" }}
            />
            {label}
          </label>
        ))}
      </div>

      {/* Writing rules */}
      <div style={{ marginTop: "12px" }}>
        <label htmlFor="sc-rules" style={labelStyle}>Writing rules (one per line)</label>
        <textarea
          id="sc-rules"
          value={style.writing_rules.join("\n")}
          onChange={(e) => update("writing_rules", e.target.value.split("\n").filter((r) => r.trim()))}
          placeholder={'e.g., Never use "excited"\nNo more than 1 exclamation point'}
          style={{
            ...selectStyle,
            minHeight: 50,
            resize: "vertical",
            fontSize: "0.75rem",
            lineHeight: 1.5,
          }}
        />
      </div>

      {/* Save as preset */}
      <button
        onClick={() => {
          const name = prompt("Preset name:");
          if (name?.trim()) onSavePreset(name.trim());
        }}
        style={{
          marginTop: "10px",
          padding: "5px 10px",
          borderRadius: "4px",
          border: "1px solid var(--border-subtle)",
          backgroundColor: "transparent",
          color: "var(--text-tertiary)",
          fontSize: "0.6875rem",
          cursor: "pointer",
          width: "100%",
        }}
      >
        Save as preset
      </button>
    </div>
  );
}
