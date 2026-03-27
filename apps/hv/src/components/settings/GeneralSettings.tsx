"use client";

import { useState, useEffect } from "react";

function useTheme() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("harvest-theme");
    const isDark = saved === "dark" || document.documentElement.getAttribute("data-theme") === "dark";
    setDark(isDark);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("harvest-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("harvest-theme", "light");
    }
  }

  return { dark, toggle };
}

export default function GeneralSettings() {
  const { dark, toggle } = useTheme();

  return (
    <div>
      {/* Appearance */}
      <div
        style={{
          padding: 20,
          borderRadius: 12,
          border: "1px solid var(--border-subtle)",
          backgroundColor: "var(--surface-raised)",
          marginBottom: 16,
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>
          Appearance
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
          Switch between light and dark mode.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Light</span>
          <button
            onClick={toggle}
            role="switch"
            aria-checked={dark}
            style={{
              position: "relative",
              width: 44,
              height: 24,
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              backgroundColor: dark ? "var(--harvest-green)" : "var(--border-subtle)",
              transition: "background-color 0.2s",
              padding: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: dark ? 22 : 2,
                width: 20,
                height: 20,
                borderRadius: "50%",
                backgroundColor: "#fff",
                transition: "left 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }}
            />
          </button>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Dark</span>
        </div>
      </div>

      {/* Account & Billing */}
      <div
        style={{
          padding: 20,
          borderRadius: 12,
          border: "1px solid var(--border-subtle)",
          backgroundColor: "var(--surface-raised)",
          marginBottom: 16,
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>
          Account & Billing
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
          Account settings, billing, and integrations are managed in your Kinetiks ID dashboard.
        </p>
        <a
          href="https://id.kinetiks.ai"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid var(--border-subtle)",
            backgroundColor: "transparent",
            color: "var(--text-primary)",
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Open Kinetiks ID
        </a>
      </div>

      {/* Harvest App Status */}
      <div
        style={{
          padding: 20,
          borderRadius: 12,
          border: "1px solid var(--border-subtle)",
          backgroundColor: "var(--surface-raised)",
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>
          Harvest App Status
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: "var(--harvest-green)",
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Active</span>
        </div>
      </div>
    </div>
  );
}
