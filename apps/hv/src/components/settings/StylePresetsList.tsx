"use client";

import { useState, useEffect, useCallback } from "react";
import type { StylePreset } from "@/types/composer";

export default function StylePresetsList() {
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPresets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hv/composer/styles");
      if (!res.ok) throw new Error(`Failed to fetch style presets: ${res.status}`);
      const json = await res.json();
      setPresets(json.data?.presets ?? []);
    } catch (err) {
      console.error("Error fetching style presets:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  if (loading) {
    return <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading...</p>;
  }

  if (presets.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: 60,
          color: "var(--text-secondary)",
          border: "1px dashed var(--border-subtle)",
          borderRadius: 12,
        }}
      >
        <p style={{ fontSize: 15, margin: "0 0 8px" }}>No style presets</p>
        <p style={{ fontSize: 13, margin: 0 }}>Create presets in the Composer to save your preferred email styles.</p>
      </div>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead>
        <tr>
          {["Name", "Tone", "Length", "Default", "Created"].map((h) => (
            <th
              key={h}
              style={{
                textAlign: "left",
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {presets.map((preset) => (
          <tr
            key={preset.id}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "var(--surface-raised)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            }}
          >
            <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500, borderBottom: "1px solid var(--border-subtle)" }}>
              {preset.name}
            </td>
            <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
              {preset.config.tone}
            </td>
            <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
              {preset.config.length}
            </td>
            <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
              {preset.is_default ? (
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    backgroundColor: "rgba(0,206,201,0.12)",
                    color: "#00CEC9",
                  }}
                >
                  default
                </span>
              ) : (
                <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>-</span>
              )}
            </td>
            <td style={{ padding: "10px 12px", color: "var(--text-tertiary)", fontSize: 13, borderBottom: "1px solid var(--border-subtle)" }}>
              {new Date(preset.created_at).toLocaleDateString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
