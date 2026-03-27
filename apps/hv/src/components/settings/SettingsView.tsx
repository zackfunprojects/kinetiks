"use client";

import { useState } from "react";
import GeneralSettings from "./GeneralSettings";
import StylePresetsList from "./StylePresetsList";
import SuppressionsList from "./SuppressionsList";
import AutomationConfig from "./AutomationConfig";
import OutreachGoalConfig from "./OutreachGoalConfig";
import InfraView from "../infra/InfraView";

type Tab = "general" | "outreach" | "styles" | "suppressions" | "automations" | "infra";

const TABS: { key: Tab; label: string }[] = [
  { key: "general", label: "General" },
  { key: "outreach", label: "Outreach Goal" },
  { key: "styles", label: "Style Presets" },
  { key: "suppressions", label: "Suppressions" },
  { key: "automations", label: "Growth" },
  { key: "infra", label: "Infra" },
];

export default function SettingsView() {
  const [tab, setTab] = useState<Tab>("general");

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "4px 0 0" }}>
          Harvest-specific configuration and preferences
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--border-subtle)",
              backgroundColor: tab === t.key ? "var(--surface-raised)" : "transparent",
              color: tab === t.key ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "general" && <GeneralSettings />}
      {tab === "outreach" && <OutreachGoalConfig />}
      {tab === "styles" && <StylePresetsList />}
      {tab === "suppressions" && <SuppressionsList />}
      {tab === "automations" && <AutomationConfig />}
      {tab === "infra" && <InfraView embedded />}
    </div>
  );
}
