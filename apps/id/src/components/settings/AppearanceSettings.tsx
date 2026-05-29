"use client";

import { useTheme, type Theme } from "@kinetiks/ui";

const OPTIONS: { value: Theme; label: string; hint: string }[] = [
  { value: "light", label: "Light", hint: "Paper" },
  { value: "dark", label: "Dark", hint: "Slate" },
];

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <div>
      <h1 className="kt-page-title" style={{ marginBottom: "var(--kt-s-2)" }}>
        Appearance
      </h1>
      <p className="kt-body" style={{ margin: "0 0 var(--kt-s-5)" }}>
        Choose how Kinetiks looks. Your choice follows you across devices.
      </p>

      <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
        <legend className="kt-eyebrow" style={{ marginBottom: "var(--kt-s-2)" }}>
          Theme
        </legend>
        <div style={{ display: "flex", gap: "var(--kt-s-3)" }}>
          {OPTIONS.map((opt) => {
            const active = theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                aria-pressed={active}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--kt-s-1)",
                  minWidth: 120,
                  padding: "var(--kt-s-3) var(--kt-s-4)",
                  textAlign: "left",
                  cursor: "pointer",
                  borderRadius: "var(--kt-radius-2)",
                  border: active ? "1px solid var(--kt-accent)" : "1px solid var(--kt-border-2)",
                  background: active ? "var(--kt-accent-soft)" : "var(--kt-bg-elevated)",
                  color: "var(--kt-fg-1)",
                  transition: "border-color var(--kt-dur-1) var(--kt-ease-standard), background var(--kt-dur-1) var(--kt-ease-standard)",
                }}
              >
                <span style={{ fontSize: "var(--kt-fs-14)", fontWeight: "var(--kt-fw-med)" }}>
                  {opt.label}
                </span>
                <span className="kt-small">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
