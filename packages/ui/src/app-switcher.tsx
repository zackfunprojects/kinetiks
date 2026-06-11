"use client";

interface AppInfo {
  name: string;
  displayName: string;
  url: string;
  color?: string;
}

interface AppSwitcherProps {
  activeApps: AppInfo[];
  inactiveApps: Array<{ name: string; displayName: string }>;
  currentApp?: string;
}

export function AppSwitcher({
  activeApps,
  inactiveApps,
  currentApp,
}: AppSwitcherProps) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {activeApps.map((app) => {
        const isCurrent = app.name === currentApp;
        return (
          <a
            key={app.name}
            href={app.url}
            title={app.displayName}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: app.color || "var(--accent-emphasis, var(--kt-fg-1))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--kt-fg-on-inverse)",
              fontWeight: 700,
              fontSize: 13,
              fontFamily: "var(--font-mono, monospace), monospace",
              textDecoration: "none",
              border: isCurrent ? "2px solid var(--accent, var(--kt-fg-1))" : "2px solid transparent",
              boxShadow: isCurrent ? "0 0 0 2px var(--kt-focus-ring)" : undefined,
              transition: "transform 0.15s",
            }}
          >
            {app.displayName[0]}
          </a>
        );
      })}
      {inactiveApps.map((app) => (
        <div
          key={app.name}
          title={`${app.displayName} - not activated`}
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            background: "var(--border-default, var(--kt-border-2))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-tertiary, var(--kt-fg-3))",
            fontWeight: 700,
            fontSize: 13,
            fontFamily: "var(--font-mono, monospace), monospace",
            cursor: "default",
          }}
        >
          {app.displayName[0]}
        </div>
      ))}
    </div>
  );
}
